'use client';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DESIGN_WIZARD_STEPS, getDesignNextStep, getDesignPrevStep } from '@/lib/utils';
import { calculateBudget, formatCurrency } from '@/lib/calculations';

// Section components
import ProjectDataSection              from '@/components/sections/ProjectDataSection';
import ExteriorSection                 from '@/components/sections/ExteriorSection';
import ControlsSection                 from '@/components/sections/ControlsSection';
import BudgetSidebar                   from '@/components/wizard/BudgetSidebar';
import { useAreaAlerts }              from '@/components/figures/AreaAlerts';
import SectionNav                      from '@/components/wizard/SectionNav';
import QuestionnaireUploads            from '@/components/wizard/QuestionnaireUploads';
import DesignUnitsSection              from '@/components/sections/design/DesignUnitsSection';
import DesignGarageSection             from '@/components/sections/design/DesignGarageSection';
import DesignCorridorsSection          from '@/components/sections/design/DesignCorridorsSection';
import DesignInteriorAmenitiesSection  from '@/components/sections/design/DesignInteriorAmenitiesSection';
import DesignEmergencySection          from '@/components/sections/design/DesignEmergencySection';
import ExitSignsSection                from '@/components/sections/ExitSignsSection';

export default function DesignWizardClient({ project, projectData, initialSections, initialBudget, pricing, hasDrawings: initialHasDrawings = false }) {
  const router = useRouter();

  // Guard: reset to 'project-data' if:
  // - stored step isn't a valid design step (set by old WizardClient), OR
  // - grossSf is missing (project data was never entered — happens when
  //   a project is switched to design mode without going through the wizard).
  const hasProjectData = (projectData?.grossSf ?? 0) > 0;
  const validDesignStep = hasProjectData && DESIGN_WIZARD_STEPS.some(s => s.id === project.currentStep);
  const [currentStep,    setCurrentStep]    = useState(validDesignStep ? project.currentStep : 'project-data');
  const [completedSteps, setCompletedSteps] = useState(project.completedSteps || []);
  const [sections,       setSections]       = useState(initialSections || {});
  const [localPD,        setLocalPD]        = useState(projectData || {});
  const [budget,         setBudget]         = useState(initialBudget);
  const [saving,         setSaving]         = useState(false);
  const [projectMeta,    setProjectMeta]    = useState({
    name:         project.name         || '',
    location:     project.location     || '',
    contactEmail: project.contactEmail || '',
  });

  async function saveProjectMeta(fields) {
    const res = await fetch(`/api/projects/${project.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(fields),
    });
    if (res.ok) setProjectMeta(m => ({ ...m, ...fields }));
  }

  // Staff-only per-area alerts (our past jobs + the original questionnaire).
  const areas = useAreaAlerts(project.id, budget, { buildingType: project.buildingType, units: localPD?.numUnits });

  const recalculate = useCallback((newPD, newSections) => {
    const b = calculateBudget(newPD, newSections, pricing || null);
    setBudget(b);
  }, [pricing]);

  async function saveProjectData(data) {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/data`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Save failed (${res.status}). ${err.error || ''}`);
        return;
      }
      const parsed = { ...localPD };
      for (const [k, v] of Object.entries(data)) {
        const num = parseFloat(v);
        parsed[k] = (!isNaN(num) && isFinite(num)) ? num : 0;
      }
      setLocalPD(parsed);
      recalculate(parsed, sections);
    } finally {
      setSaving(false);
    }
  }

  // A drawing upload committed to Project Info. The commit route returns the
  // fresh ProjectData row, so the form and the live budget pick it up here —
  // no reload, and no second fetch.
  // A drawing read just landed, so small vs long breezeway can now be asked.
  const [hasDrawings, setHasDrawings] = useState(initialHasDrawings);
  const handleDrawingCommit = useCallback((newPD) => {
    if (!newPD) return;
    setHasDrawings(true);
    setLocalPD(newPD);
    recalculate(newPD, sections);
  }, [recalculate, sections]);

  async function saveResponses(section, responses) {
    setSaving(true);
    try {
      await fetch(`/api/projects/${project.id}/responses`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, responses }),
      });
      const newSections = { ...sections, [section]: responses };
      setSections(newSections);
      recalculate(localPD, newSections);
    } finally {
      setSaving(false);
    }
  }

  async function goToNext() {
    const next = getDesignNextStep(currentStep);
    const newCompleted = completedSteps.includes(currentStep)
      ? completedSteps
      : [...completedSteps, currentStep];
    setCompletedSteps(newCompleted);
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentStep: next || 'summary', completedSteps: newCompleted }),
    });
    if (next) setCurrentStep(next);
    else router.push(`/project/${project.id}/summary`);
  }

  async function goToPrev() {
    const prev = getDesignPrevStep(currentStep);
    if (prev) setCurrentStep(prev);
  }

  function jumpToStep(stepId) {
    if (stepId === 'summary') {
      router.push(`/project/${project.id}/summary`);
    } else {
      setCurrentStep(stepId);
    }
  }

  // getDesignNextStep('controls') returns 'summary' (a real entry in
  // DESIGN_WIZARD_STEPS), so goToNext sets currentStep='summary' rather than
  // hitting its router.push fallback. Without this effect the wizard renders the
  // "Redirecting to summary…" interstitial forever and never navigates — and
  // because 'summary' gets persisted to the DB, a reload stays stuck too.
  // Mirror of the redirect in WizardClient.
  useEffect(() => {
    if (currentStep === 'summary') {
      router.push(`/project/${project.id}/summary`);
    }
  }, [currentStep, project.id, router]);

  const stepIndex  = DESIGN_WIZARD_STEPS.findIndex(s => s.id === currentStep);
  const totalSteps = DESIGN_WIZARD_STEPS.length - 1;

  const sharedProps = {
    projectId:   project.id,
    projectData: localPD,
    allSections: sections,
    budget,
    pricing,
    hasDrawings,
    isDesign: true,
    onNext: goToNext,
    onPrev: goToPrev,
    isFirst: stepIndex === 0,
    isLast:  currentStep === 'controls',
  };

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* Left nav */}
      <SectionNav
        steps={DESIGN_WIZARD_STEPS}
        currentStep={currentStep}
        completedSteps={completedSteps}
        onJump={jumpToStep}
        project={{ ...project, ...projectMeta }}
        onSaveProjectMeta={saveProjectMeta}
      />

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Step header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
              <span>Step {Math.min(stepIndex + 1, totalSteps)} of {totalSteps}</span>
              <div className="flex-1 max-w-32 bg-slate-100 rounded-full h-1">
                <div
                  className="bg-amber-500 h-1 rounded-full transition-all"
                  style={{ width: `${(Math.min(stepIndex, totalSteps - 1) / (totalSteps - 1)) * 100}%` }}
                />
              </div>
              <span className="ml-1 text-amber-600 font-medium text-[10px] uppercase tracking-wider">Design Budget</span>
            </div>
            {saving && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
                Saving...
              </div>
            )}
          </div>

          {/* Section content */}

          {currentStep === 'project-data' && (
            <>
              <QuestionnaireUploads
                projectId={project.id}
                projectData={localPD}
                onProjectData={handleDrawingCommit}
              />
              <ProjectDataSection
                {...sharedProps}
                responses={sections['project-data'] || {}}
                allSections={sections}
                onSaveData={saveProjectData}
                onSaveResponses={(r) => saveResponses('project-data', r)}
              />
            </>
          )}

          {currentStep === 'design-units' && (
            <DesignUnitsSection
              {...sharedProps}
              responses={sections['units'] || {}}
              onSaveResponses={(r) => saveResponses('units', r)}
            />
          )}

          {currentStep === 'design-garage' && (
            <DesignGarageSection
              {...sharedProps}
              emergencyStrategy={sections['emergency']?.strategy}
              responses={sections['corridors'] || {}}
              onSaveResponses={(r) => saveResponses('corridors', r)}
            />
          )}

          {currentStep === 'design-corridors' && (
            <DesignCorridorsSection
              {...sharedProps}
              responses={sections['corridors'] || {}}
              onSaveResponses={(r) => saveResponses('corridors', r)}
            />
          )}

          {currentStep === 'interior-amenities' && (
            <DesignInteriorAmenitiesSection
              {...sharedProps}
              responses={sections['amenities'] || {}}
              onSaveResponses={(r) => saveResponses('amenities', r)}
            />
          )}

          {currentStep === 'exterior' && (
            <ExteriorSection
              {...sharedProps}
              responses={sections['exterior'] || {}}
              allSections={sections}
              onSaveResponses={(r) => saveResponses('exterior', r)}
            />
          )}

          {currentStep === 'design-emergency' && (
            <DesignEmergencySection
              {...sharedProps}
              responses={sections['emergency'] || {}}
              onSaveResponses={(r) => saveResponses('emergency', r)}
            />
          )}

          {currentStep === 'design-exit-signs' && (
            <ExitSignsSection
              {...sharedProps}
              responses={sections['corridors'] || {}}
              onSaveResponses={(r) => saveResponses('corridors', { ...(sections['corridors'] || {}), ...r })}
            />
          )}

          {currentStep === 'controls' && (
            <ControlsSection
              {...sharedProps}
              responses={sections['controls'] || {}}
              allSections={sections}
              onSaveResponses={(r) => saveResponses('controls', r)}
            />
          )}

          {currentStep === 'summary' && (
            <div className="text-center py-16">
              <p className="text-slate-500 mb-4">Redirecting to summary...</p>
            </div>
          )}

        </div>
      </div>

      {/* Right: Live budget sidebar */}
      <BudgetSidebar
        budget={budget}
        projectData={localPD}
        currentStep={currentStep}
        areaNotes={areas.notes}
        areaSummary={areas.summary}
      />
    </div>
  );
}
