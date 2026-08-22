import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { loadPricing } from '@/lib/pricingLoader';
import { parseConceptualBudgetXlsx } from '@/lib/excelImportParser';
import * as XLSX from 'xlsx';
import { readUploadedFiles } from '@/lib/uploadIntake';

// POST /api/admin/import
// Accepts: multipart/form-data
//   action = "parse"   → parse files, return preview (no DB writes)
//   action = "confirm" → receive reviewed JSON array, create projects in DB
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  // Any logged-in user can import their own projects

  const contentType = request.headers.get('content-type') || '';

  // ── CONFIRM: create projects from reviewed data ──────────────────────────
  if (contentType.includes('application/json')) {
    const { projects } = await request.json();
    if (!Array.isArray(projects) || projects.length === 0) {
      return NextResponse.json({ error: 'No projects provided' }, { status: 400 });
    }

    const pricing = await loadPricing();
    const created = [];
    const failed  = [];

    for (const p of projects) {
      try {
        // Create project
        const project = await prisma.project.create({
          data: {
            name:            p.name || 'Imported Project',
            buildingType:    p.buildingType || null,
            location:        p.location    || null,
            status:          'DRAFT',
            currentStep:     'project-data',
            completedSteps:  '[]',
            pricingSnapshot: JSON.stringify(pricing),
            createdById:     user.id,
          },
        });

        // Create project data (filter null values)
        const pd = p.projectData || {};
        const pdFiltered = Object.fromEntries(
          Object.entries(pd).filter(([, v]) => v != null)
        );
        if (Object.keys(pdFiltered).length > 0) {
          await prisma.projectData.create({
            data: { projectId: project.id, ...pdFiltered },
          });
        }

        // Create questionnaire responses
        if (Array.isArray(p.responses) && p.responses.length > 0) {
          await prisma.questionnaireResponse.createMany({
            data: p.responses
              .filter(r => r.answerValue)
              .map(r => ({
                projectId:   project.id,
                section:     r.section,
                questionKey: r.questionKey,
                answerValue: String(r.answerValue),
              })),
          });
        }

        created.push({ id: project.id, name: project.name });
      } catch (e) {
        failed.push({ name: p.name, error: e.message });
      }
    }

    return NextResponse.json({ created, failed });
  }

  // ── PARSE: read uploaded files, return preview data ──────────────────────
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data or application/json' }, { status: 400 });
  }

  const formData = await request.formData();
  // Spreadsheets may have gone straight to S3 to clear Amplify's ~4.4 MB front
  // door; readUploadedFiles hides which way they arrived.
  const got = await readUploadedFiles(formData);
  if (!got.ok) return NextResponse.json({ error: got.message }, { status: got.status });

  const results = [];

  for (const file of got.files) {
    const filename = file.name || 'unknown.xlsx';
    try {
      const parsed = parseConceptualBudgetXlsx(XLSX, file.buffer);
      results.push({ filename, ok: true, ...parsed });
    } catch (e) {
      results.push({ filename, ok: false, error: e.message });
    }
  }
  await got.cleanup();

  return NextResponse.json({ results });
}
