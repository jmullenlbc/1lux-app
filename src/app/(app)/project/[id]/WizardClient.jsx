'use client';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getActiveSteps, getNextStep, getPrevStep, getStepIndex } from '@/lib/utils';
import { calculateBudget, formatCurrency } from '@/lib/calculations';

// Section components (unified — each accepts isDesign prop)
import ProjectDataSection  from '@/components/sections/ProjectDataSection';
import UnitsSection        from '@/components/sections/UnitsSection';
import CorridorsSection    from '@/components/sections/CorridorsSection';
import AmenitiesSection    from '@/components/sections/AmenitiesSection';
import ExteriorSection     from '@/components/sections/ExteriorSection';
import EmergencySection    from '@/components/sections/EmergencySection';
import ExitSignsSection    from '@/components/sections/ExitSignsSection';
import ControlsSection     from '@/components/sections/ControlsSection';
import BudgetSidebar       from '@/components/wizard/BudgetSidebar';
import SectionNav          from '@/components/wizard/SectionNav';

export default function WizardClient({ project, projectData, initialSections, initialBudget, pricing, isDesign = false }) {
  const router = useRouter();

  const activeSteps = getActiveSteps(isDesign);

  const [currentStep,    setCurrentStep]    = useState(() => {
    const saved = project.currentStep;
    // If saved step doesn't exist in active steps, start at beginning
    if (saved && saved !== 'summary' && activeSteps.find(s => s.id === saved)) return saved;
    return 'project-data';
  });
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

  const recalculate = useCallback((newPD, newSections) => {
    const b = calculateBudget(newPD, newSections, pricing || null);
    setBudget(b);
  }, [pricing]);

  async function saveProjectData(data) {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/data`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Project data save failed:', res.status, err);
        alert(`Save failed (${res.status}). You may need to run "npx prisma db push" in your terminal.`);
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

  // Save questionnaire responses for a section
  // Use the merge param to preserve keys already in the section (for shared section keys)
  async function saveResponses(section, responses) {
    setSaving(true);
    try {
      await fetch(`/api/projects/${project.id}/responses`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ section, responses }),
      });
      const newSections = { ...sections, [section]: responses };
      setSections(newSections);
      recalculate(localPD, newSections);
    } finally {
      setSaving(false);
    }
  }

  async function goToNext() {
    const next = getNextStep(currentStep, isDesign);

    const newCompleted = completedSteps.includes(currentStep)
      ? completedSteps
      : [...completedSteps, currentStep];
    setCompletedSteps(newCompleted);

    await fetch(`/api/projects/${project.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        currentStep:    next || 'summary',
        completedSteps: newCompleted,
      }),
    });

    if (next) {
      setCurrentStep(next);
    } else {
      router.push(`/project/${project.id}/summary`);
    }
  }

  async function goToPrev() {
    const prev = getPrevStep(currentStep, isDesign);
    if (prev) setCurrentStep(prev);
  }

  function jumpToStep(stepId) {
    if (stepId === 'summary') {
      router.push(`/project/${project.id}/summary`);
    } else {
      setCurrentStep(stepId);
    }
  }

  // If somehow the wizard loads with currentStep='summary' (e.g. persisted in DB), auto-redirect
  useEffect(() => {
    if (currentStep === 'summary') {
      router.push(`/project/${project.id}/summary`);
    }
  }, [currentStep, project.id, router]);

  const stepIndex  = getStepIndex(currentStep, isDesign);
  const totalSteps = activeSteps.length - 1; // exclude summary

  // Shared props passed to every section
  const sharedSectionProps = {
    projectId:   project.id,
    projectData: localPD,
    allSections: sections,
    budget,
    isDesign,
    onSaveData:       saveProjectData,
    onNext:           goToNext,
    onPrev:           goToPrev,
    isFirst:          stepIndex === 0,
  };

  // Corridors and Exit Signs both write to the 'corridors' section — always merge
  function saveCorridors(r) {
    return saveResponses('corridors', { ...(sections['corridors'] || {}), ...r });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left nav */}
      <SectionNav
        steps={activeSteps}
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

          {/* Section rendering */}
          {currentStep === 'summary' && (
            <div className="text-center py-16">
              <p className="text-slate-500 mb-4">Redirecting to summary…</p>
            </div>
          )}

          {currentStep === 'project-data' && (
            <ProjectDataSection
              {...sharedSectionProps}
              responses={sections['project-data'] || {}}
              onSaveResponses={r => saveResponses('project-data', r)}
            />
          )}

          {currentStep === 'units' && (
            <UnitsSection
              {...sharedSectionProps}
              responses={sections['units'] || {}}
              onSaveResponses={r => saveResponses('units', r)}
            />
          )}

          {currentStep === 'corridors' && (
            <CorridorsSection
              {...sharedSectionProps}
              responses={sections['corridors'] || {}}
              onSaveResponses={saveCorridors}
            />
          )}

          {currentStep === 'exit-signs' && (
            <ExitSignsSection
              {...sharedSectionProps}
              responses={sections['corridors'] || {}}
              onSaveResponses={saveCorridors}
            />
          )}

          {currentStep === 'amenities' && (
            <AmenitiesSection
              {...sharedSectionProps}
              responses={sections['amenities'] || {}}
              onSaveResponses={r => saveResponses('amenities', r)}
            />
          )}

          {currentStep === 'exterior' && (
            <ExteriorSection
              {...sharedSectionProps}
              responses={sections['exterior'] || {}}
              onSaveResponses={r => saveResponses('exterior', r)}
            />
          )}

          {currentStep === 'emergency' && (
            <EmergencySection
              {...sharedSectionProps}
              responses={sections['emergency'] || {}}
              onSaveResponses={r => saveResponses('emergency', r)}
            />
          )}

          {currentStep === 'controls' && (
            <ControlsSection
              {...sharedSectionProps}
              responses={sections['controls'] || {}}
              onSaveResponses={r => saveResponses('controls', r)}
              isLast={true}
            />
          )}
        </div>
      </div>

      {/* Right: Live budget sidebar */}
      <BudgetSidebar
        budget={budget}
        projectData={localPD}
        currentStep={currentStep}
      />
    </div>
  );
}
