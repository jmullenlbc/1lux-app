'use client';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { mergeLiveSections } from '@/components/wizard/useLiveAnswers';
import { useRouter } from 'next/navigation';
import { getActiveSteps, getNextStep, isHomeBuildingKey, stepsForHome, stepBeside, HOME_SKIPPED_STEPS } from '@/lib/utils';
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
import { useAreaAlerts }              from '@/components/figures/AreaAlerts';
import SectionNav          from '@/components/wizard/SectionNav';
import QuestionnaireUploads from '@/components/wizard/QuestionnaireUploads';

export default function WizardClient({ project, projectData, initialSections, initialBudget, pricing, hasDrawings: initialHasDrawings = false, isDesign = false }) {
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
  // Mike 10-15: unsaved answers from the open screen, laid over the saved ones
  // for the live budget only (`__pd` = Project Info numbers being typed).
  const [live,           setLive]           = useState({});
  const [saving,         setSaving]         = useState(false);
  // Small vs long breezeway is asked only once drawings are on file; a drawing
  // read committed on this screen flips it on.
  const [hasDrawings,    setHasDrawings]    = useState(initialHasDrawings);
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

  const homeType = isHomeBuildingKey(localPD?.buildingTypeKey || project.buildingType);
  const navSteps = stepsForHome(activeSteps, homeType);

  // The live budget: saved answers + whatever the open screen has changed but
  // not yet saved (Mike 10-15: "the price on the right updates as soon as you
  // change a choice"). Nothing is written until Next.
  const budget = useMemo(() => {
    const pd = live.__pd ? { ...localPD, ...live.__pd } : localPD;
    return calculateBudget(pd, mergeLiveSections(sections, live), pricing || null);
  }, [localPD, sections, live, pricing]);
  const onLiveAnswers = useCallback((sec, a) => setLive(l => {
    if (l[sec] === a) return l;
    const next = { ...l };
    if (a == null) delete next[sec]; else next[sec] = a;
    return next;
  }), []);
  const onLiveData = useCallback(pd => onLiveAnswers("__pd", pd), [onLiveAnswers]);

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
      // Site features (dog parks, courts, …) are rows, not columns: the engine
      // reads them as `siteFeatures`, which the route returns freshly loaded.
      const saved = await res.json().catch(() => ({}));
      if (Array.isArray(saved?.projectData?.siteFeatures)) parsed.siteFeatures = saved.projectData.siteFeatures;
      setLocalPD(parsed);
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
      // Merge: sections send only the keys they touched, and a dropped key
      // would fall back to its default on the live budget until a reload.
      const newSections = { ...sections, [section]: { ...(sections[section] || {}), ...responses } };
      setSections(newSections);
    } finally {
      setSaving(false);
    }
  }

  async function goToNext() {
    const next = stepBeside(navSteps, currentStep, 1);

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
    const prev = stepBeside(navSteps, currentStep, -1);
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

  // Homes skip the Corridors page (Mike 10-2); a saved spot there moves on.
  useEffect(() => {
    if (homeType && HOME_SKIPPED_STEPS.includes(currentStep)) setCurrentStep(getNextStep(currentStep, isDesign));
  }, [homeType, currentStep, isDesign]);

  const stepIndex  = navSteps.findIndex(s => s.id === currentStep);
  const totalSteps = navSteps.length - 1; // exclude summary

  // Shared props passed to every section
  const sharedSectionProps = {
    projectId:   project.id,
    projectData: localPD,
    allSections: sections,
    budget,
    pricing,
    hasDrawings,
    onLiveAnswers,
    onLiveData,
    isDesign,
    homeType,
    onSaveData:       saveProjectData,
    onNext:           goToNext,
    onPrev:           goToPrev,
    isFirst:          stepIndex === 0,
  };

  // Corridors and Exit Signs both write to the 'corridors' section — always merge
  function saveCorridors(r) {
    return saveResponses('corridors', { ...(sections['corridors'] || {}), ...r });
  }

  // A drawing upload committed to Project Info. The commit route returns the
  // fresh ProjectData row, so the form and the live budget pick it up here —
  // no reload, and no second fetch.
  // `answers` = questionnaire answers the site read filled in (today the
  // Corridors breezeway style, Mike 10-14 "Prefill"), merged in here so the
  // screen opens with them without a reload.
  const handleDrawingCommit = useCallback((newPD, answers = null) => {
    if (!newPD) return;
    setHasDrawings(true);
    setLocalPD(newPD);
    let next = sections;
    if (answers && typeof answers === 'object') {
      next = { ...sections };
      for (const [section, vals] of Object.entries(answers)) next[section] = { ...(sections[section] || {}), ...vals };
      setSections(next);
    }
  }, [sections]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left nav */}
      <SectionNav
        steps={navSteps}
        currentStep={currentStep}
        completedSteps={completedSteps}
        onJump={jumpToStep}
        project={{ ...project, ...projectMeta }}
        onSaveProjectMeta={saveProjectMeta}
      />

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <button onClick={() => router.push(`/project/${project.id}`)} className="text-xs text-slate-400 hover:text-amber-600 transition-colors mb-4 inline-block">
            ← Back to {project.name}
          </button>
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
            <>
              <QuestionnaireUploads
                projectId={project.id}
                projectData={localPD}
                onProjectData={handleDrawingCommit}
              />
              <ProjectDataSection
                {...sharedSectionProps}
                responses={sections['project-data'] || {}}
                onSaveResponses={r => saveResponses('project-data', r)}
              />
            </>
          )}

          {currentStep === 'units' && (
            <UnitsSection
              {...sharedSectionProps}
              responses={sections['units'] || {}}
              onSaveResponses={r => saveResponses('units', r)}
              onSaveCorridors={saveCorridors}
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
        interiorRate={(live.amenities?.interiorLevel ?? sections.amenities?.interiorLevel) || null}
        projectName={projectMeta?.name || project.name || ''}
        projectData={localPD}
        currentStep={currentStep}
        homeType={homeType}
        areaNotes={areas.notes}
        areaSummary={areas.summary}
      />
    </div>
  );
}
