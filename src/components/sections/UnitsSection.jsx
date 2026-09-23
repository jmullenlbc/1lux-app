'use client';
import { useState, useMemo } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import QuestionCard from './QuestionCard';
import { formatCurrency, calculateBudget } from '@/lib/calculations';
import { PRICING } from '@/lib/pricing';
import StandardsHint from '@/components/wizard/StandardsHint';

const FAN_ROOMS = {
  none: 0, masterOnly: 1, livingRoomOnly: 1, masterAndLiving: 2,
  masterAndSecondary: 1.5, masterSecondaryLiving: 2.5,
  masterSecondaryTertiary: 2.5, masterSecondaryTertiaryLiving: 2.75,
};

export default function UnitsSection({ responses, projectData, allSections, pricing, onSaveResponses, onNext, onPrev, isDesign = false }) {
  // Single source of truth: read costs from the live master pricing (same object
  // the engine uses), falling back to static defaults. Prevents UI/engine drift.
  const P = pricing || PRICING;
  // Vanity: master holds GROSS; net adder = gross − bath-bar credit (base includes a bath bar).
  const vanCredit = P.vanityBathBarCredit ?? 45;
  const vanNet = k => { const g = P.vanity?.[k]?.product || 0; return g > 0 ? Math.max(0, g - vanCredit) : 0; };
  const [ans, setAns] = useState(() => ({
    // ── Conceptual questions (always shown) ──────────────────────────────
    undercabinet:       responses.undercabinet       || 'none',
    kitchenPendants:    responses.kitchenPendants    || 'none',
    fans:               responses.fans               || 'none',
    vanity:             responses.vanity             || 'bathBarLow',
    balcony:            responses.balcony            || 'none',
    // ── Per-project price overrides (blank = use the master price sheet) ──
    kitchenPendantsPrice: responses.kitchenPendantsPrice ?? '',
    fansPrice:            responses.fansPrice            ?? '',
    vanityPrice:          responses.vanityPrice          ?? '',
    balconyPrice:         responses.balconyPrice         ?? '',
    // ── Design-only questions ────────────────────────────────────────────
    diskType:           responses.diskType           || 'flatEdgeLit',
    diskSize:           responses.diskSize           || '5inch',
    entryDisk:          responses.entryDisk          || 'typical',
    fireRating:         responses.fireRating         || 'none',
    dimmersPerUnit:     responses.dimmersPerUnit     || '0',
    boilerRoom:         responses.boilerRoom         || 'no',
    undercabinetSwitch: responses.undercabinetSwitch || 'integrated',
    fanLevel:           responses.fanLevel           || 'medium',
    fanSize52:          responses.fanSize52          || 'no',
    fanLightKit:        responses.fanLightKit        || 'no',
    fanSupplemental:    responses.fanSupplemental    || 'no',
    livingRoomDisks:    responses.livingRoomDisks    || '1large',
    halfHotReceptacles: responses.halfHotReceptacles || 'no',
    closetControl:      responses.closetControl      || 'switch',
    manualAdder:        responses.manualAdder        ?? '',
  }));
  const [dirty, setDirty] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  // What each answer costs (+ estimated labor), recomputed live as answers
  // change — local answers only save on Next (Mike 2026-09-13).
  const qc = useMemo(
    () => calculateBudget(projectData, { ...(allSections || {}), units: { ...(allSections?.units || {}), ...ans } }, pricing || null).questionCosts || {},
    [projectData, allSections, ans, pricing],
  );

  function set(k, v) {
    setAns(a => ({ ...a, [k]: v }));
    setDirty(d => new Set(d).add(k));
  }

  const hasFans         = ans.fans !== 'none';
  // The master net adder per fan, mirroring the engine: the conceptual fan
  // price and the design fan levels are both GROSS on the sheet, so the disk
  // credit comes off either one ($175 − $35 = $140 at conceptual, at today's
  // sheet — the figure is whatever /admin/pricing holds, never typed here).
  const fanDiskCredit   = P.fans?.diskCredit ?? 35;
  const fanConceptual   = Number(P.fans?.conceptualPerFan) > 0
    ? Math.max(0, Number(P.fans.conceptualPerFan) - fanDiskCredit)
    : (P.fans?.adderPerFan ?? 145);
  const fanLevelKey     = (isDesign && ans.fanLevel && P.designFanLevels?.[ans.fanLevel]) ? ans.fanLevel : null;
  const fanMasterPerFan = fanLevelKey
    ? Math.max(0, P.designFanLevels[fanLevelKey] - fanDiskCredit)
    : fanConceptual;
  const fanOptionCost   = (fansPerUnit) => Math.round(fanMasterPerFan * fansPerUnit);
  const hasUndercab120v = ans.undercabinet === 'lineVoltage';

  const numUnits     = Number(projectData?.numUnits)    || 0;
  const unitsSf      = Number(projectData?.unitsSf)     || 0;
  const numVanities  = Number(projectData?.numVanities) || Number(projectData?.numBathrooms) || 0;
  const numBalconies = Number(projectData?.numBalconies)|| 0;
  const baseProduct  = unitsSf * P.base.perSf;

  async function handleNext() {
    setSaving(true);
    // Only send fields the user actually touched
    const payload = {};
    for (const key of dirty) {
      payload[key] = ans[key];
    }
    // In conceptual mode, null out design-only fields so they don't pollute the budget
    if (!isDesign) {
      payload.diskType           = null;
      payload.diskSize           = null;
      payload.entryDisk          = null;
      payload.fireRating         = null;
      payload.dimmersPerUnit     = null;
      payload.boilerRoom         = null;
      payload.undercabinetSwitch = null;
      payload.livingRoomDisks    = null;
      payload.halfHotReceptacles = null;
      payload.closetControl      = null;
      payload.fanLevel           = null;
      payload.fanSize52          = null;
      payload.fanLightKit        = null;
      payload.fanSupplemental    = null;
    } else if (ans.fans === 'none') {
      payload.fanLevel        = null;
      payload.fanSize52       = null;
      payload.fanLightKit     = null;
      payload.fanSupplemental = null;
    } else {
      // A design budget always carries its fan level — that is what moves the
      // engine off the flat conceptual $175 and onto the level's real price.
      payload.fanLevel = ans.fanLevel || 'medium';
    }
    if (Object.keys(payload).length > 0) {
      await onSaveResponses(payload);
    }
    setDirty(new Set());
    setSaving(false);
    onNext();
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Residential Units</h2>
        <p className="text-slate-500 text-sm mt-1">
          Select the lighting approach for each element. Budget updates live on the right.
        </p>
      </div>

      <StandardsHint category="UNIT" />

      {/* Scope summary */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Unit Scope</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { label: 'Total Units',    value: numUnits    || '—' },
            { label: 'Units Gross SF', value: unitsSf > 0 ? unitsSf.toLocaleString() : '—' },
            { label: 'Vanities',       value: numVanities || '—' },
            { label: 'Balconies',      value: numBalconies|| '—' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg border border-slate-100 p-3">
              <div className="text-xl font-bold text-slate-900">{item.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
        {unitsSf > 0 && (
          <p className="text-xs text-slate-400 mt-3">
            Base unit budget: {formatCurrency(baseProduct)} ({unitsSf.toLocaleString()} SF × ${P.base.perSf}/SF).
            Adders below are per unit or per fixture.
          </p>
        )}
      </div>

      {/* ── GENERAL / ENTRY (design only) ─────────────────────────────────── */}
      {isDesign && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">General / Entry</div>
          <div className="space-y-4">

            <QuestionCard
              question="Flat, edge-lit disk or rounded, backlit disk?"
              note="Flat edge-lit is the standard profile. Rounded backlit gives a softer glow and is slightly cheaper (-$0.04/SF of units)."
              costSuffix="/SF"
              options={[
                { value: 'flatEdgeLit', label: 'Flat, Edge-lit Disk',    sub: 'Standard — included in base', cost: 0 },
                { value: 'backlit',     label: 'Rounded, Back-lit Disk', sub: '-$0.04/SF — softer glow',    cost: -0.04 },
              ]}
              value={ans.diskType}
              onChange={v => set('diskType', v)}
            />

            <QuestionCard
              question="What size ceiling disk in the units?"
              note='7" provides more light output and is recommended for higher ceilings. Both included in the base — no added cost.'
              options={[
                { value: '5inch', label: '5" Disk', sub: 'Standard — included in base', cost: 0 },
                { value: '7inch', label: '7" Disk', sub: 'Included in base — slightly more light output', cost: 0 },
              ]}
              value={ans.diskSize}
              onChange={v => set('diskSize', v)}
            />

            <QuestionCard
              question="Statement at unit entries — larger disk, decorative mount, or typical?"
              note='12" disk adds ~$25/unit. Decorative surface mount ~$30/unit. No additional labor cost.'
              options={[
                { value: 'typical',    label: 'Typical — same disk as rest of unit', cost: 0 },
                { value: '12inch',     label: '12" Statement Disk at entry',         cost: P.designUpgrades?.entryway12inch ?? 25 },
                { value: 'decorative', label: 'Decorative Surface Mount at entry',   cost: P.designUpgrades?.entryDecorative ?? 30 },
              ]}
              value={ans.entryDisk}
              onChange={v => set('entryDisk', v)}
            />

            <QuestionCard
              question="Do you need fire-rating housing in the ceiling?"
              note="2-hour rated j-boxes are typically standard. Some buildings require 1-hour rated IC housings for recessed fixtures. Informational — no cost impact unless recessed downlights are specified."
              options={[
                { value: 'none', label: 'None — typical j-boxes',                    cost: 0 },
                { value: '1hr',  label: '1-Hour fire-rated IC housing required',      cost: 0 },
                { value: '2hr',  label: '2-Hour fire-rated IC housing required',      cost: 0 },
              ]}
              value={ans.fireRating}
              onChange={v => set('fireRating', v)}
            />

            <QuestionCard
              question="Basic switching or dimmers? How many dimmers per unit?"
              note="Dimmers/switching are included in the base package — no added cost. Typical locations: kitchen, living room, master bedroom."
              options={[
                { value: '0', label: 'No dimmers — basic on/off switching only', cost: 0 },
                { value: '1', label: '1 dimmer per unit',  cost: 0 },
                { value: '2', label: '2 dimmers per unit', cost: 0 },
                { value: '3', label: '3 dimmers per unit', cost: 0 },
                { value: '4', label: '4 dimmers per unit', cost: 0 },
                { value: '5', label: '5 dimmers per unit', cost: 0 },
                { value: '6', label: '6 dimmers per unit', cost: 0 },
              ]}
              value={ans.dimmersPerUnit}
              onChange={v => set('dimmersPerUnit', v)}
            />

            <QuestionCard
              question="Include a disk in each unit HVAC / mechanical closet?"
              note='7" disk with integrated occupancy sensor. Code typically requires lighting in mechanical spaces.'
              options={[
                { value: 'no',  label: 'No',                                          cost: 0  },
                { value: 'yes', label: 'Yes — 7" disk w/ occupancy sensor', cost: P.designUpgrades?.boilerRoomDisk ?? 15 },
              ]}
              value={ans.boilerRoom}
              onChange={v => set('boilerRoom', v)} impact={qc['units.boilerRoom']}
            />

          </div>
        </div>
      )}

      {/* ── KITCHEN ──────────────────────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Kitchen</div>
        <div className="space-y-4">

          <QuestionCard
            question="Is undercabinet lighting desired?"
            note='Both options require a 1.5" valance on upper cabinets. Line voltage has an integral power supply. Low voltage is slimmer but needs a remote driver hidden in a cabinet.'
            options={[
              { value: 'none',        label: 'None',                     cost: P.undercabinet.none.product },
              { value: 'lineVoltage', label: '120v',         sub: 'Integral power supply',     cost: P.undercabinet.lineVoltage.product },
              { value: 'lowVoltage',  label: 'Low voltage',      sub: 'Slim tape + remote driver', cost: P.undercabinet.lowVoltage.product },
            ]}
            value={ans.undercabinet}
            onChange={v => set('undercabinet', v)} impact={qc['units.undercabinet']}
          />

          {isDesign && hasUndercab120v && (
            <QuestionCard
              question="(120V selected) How should the undercabinet switch be handled?"
              note="Fixture integrated switch removes a wall switch across every unit (~$60 savings per unit)."
              options={[
                { value: 'integrated', label: 'Integrated on/off switch on fixture', sub: 'Saves ~$60/unit vs. wall switch', cost: 0 },
                { value: 'wallSwitch', label: 'Dedicated wall switch (ganged with kitchen lights)',                           cost: 0 },
                { value: 'backsplash', label: 'Switch in backsplash, ganged with receptacle',                                cost: 0 },
              ]}
              value={ans.undercabinetSwitch}
              onChange={v => set('undercabinetSwitch', v)}
            />
          )}

          <QuestionCard
            question="Are kitchen island pendants desired?"
            note="Cost is the delta vs. using a standard ceiling disk over the island."
            options={[
              { value: 'none',             label: 'None',        cost: P.kitchenPendants.none.product },
              { value: 'threeSmallLow',    label: '3 small pendants (Low finish)',     cost: P.kitchenPendants.threeSmallLow.product },
              { value: 'threeSmallMedium', label: '3 small pendants (Medium finish)',  cost: P.kitchenPendants.threeSmallMedium.product },
              { value: 'twoMediumLow',     label: '2 medium pendants (Low finish)',    cost: P.kitchenPendants.twoMediumLow.product },
              { value: 'twoMediumMedium',  label: '2 medium pendants (Medium finish)', cost: P.kitchenPendants.twoMediumMedium.product },
              { value: 'oneLarge',         label: '1 large pendant',         cost: P.kitchenPendants.oneLarge.product },
              { value: 'oneLinear',        label: '1 linear pendant',      cost: P.kitchenPendants.oneLinear.product },
            ]}
            value={ans.kitchenPendants}
            onChange={v => set('kitchenPendants', v)} impact={qc['units.kitchenPendants']}
            override={{
              value:       ans.kitchenPendantsPrice,
              onChange:    v => set('kitchenPendantsPrice', v),
              masterPrice: P.kitchenPendants[ans.kitchenPendants]?.product,
              disabled:    ans.kitchenPendants === 'none',
            }}
          />

        </div>
      </div>

      {/* ── LIVING ROOM / BEDROOMS ───────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Living Room / Bedrooms</div>
        <div className="space-y-4">

          <QuestionCard
            question="Are ceiling fans desired and in what locations?"
            note={`A typical 48" fan installed runs $350 total (product + labor). Net adder depends on level selected${isDesign ? ' below' : ''}.`}
            options={[
              { value: 'none',                         label: 'None',                                                    sub: '—',                   cost: isDesign ? undefined : 0 },
              { value: 'masterOnly',                   label: 'Master bed only',                                        sub: '1 fan/unit',           cost: isDesign ? undefined : fanOptionCost(1) },
              { value: 'livingRoomOnly',               label: 'Living room only',                                           sub: '1 fan/unit',           cost: isDesign ? undefined : fanOptionCost(1) },
              { value: 'masterAndLiving',              label: 'Master bed + Living room',                                   sub: '2 fans/unit',          cost: isDesign ? undefined : fanOptionCost(2) },
              { value: 'masterAndSecondary',           label: 'Master bed + Secondary bed',                                 sub: '~1.5 fans avg/unit',   cost: isDesign ? undefined : fanOptionCost(1.5) },
              { value: 'masterSecondaryLiving',        label: 'Master bed/Secondary bed/Living room',                  sub: '~2.5 fans avg/unit',   cost: isDesign ? undefined : fanOptionCost(2.5) },
              { value: 'masterSecondaryTertiary',      label: 'Master bed/Secondary bed/Tertiary bed',                 sub: '~2.5 fans avg/unit',   cost: isDesign ? undefined : fanOptionCost(2.5) },
              { value: 'masterSecondaryTertiaryLiving',label: 'Master bed/Secondary bed/Tertiary bed + Living room',   sub: '~2.75 fans avg/unit',  cost: isDesign ? undefined : fanOptionCost(2.75) },
            ]}
            value={ans.fans}
            onChange={v => set('fans', v)} impact={qc['units.fans']}
            costSuffix="/unit"
            override={{
              value:       ans.fansPrice,
              onChange:    v => set('fansPrice', v),
              masterPrice: fanMasterPerFan,
              suffix:      '/fan',
              disabled:    !hasFans,
            }}
          />

          {isDesign && hasFans && (
            <>
              <QuestionCard
                question="(Fans selected) What level of ceiling fan?"
                note="Low = pull-chain builder grade. Medium = eLuma spec grade. High = custom/premium."
                costSuffix="/fan"
                options={[
                  // Same math as the engine: the level price is gross, the
                  // $35 disk credit comes off it. Read from the master sheet
                  // so a pricing edit shows here without a code change.
                  { value: 'low',    label: 'Ceiling fan (Low finish)',    sub: 'pull-chain builder grade', cost: Math.max(0, (P.designFanLevels?.low    ?? 142) - fanDiskCredit) },
                  { value: 'medium', label: 'Ceiling fan (Medium finish)', sub: 'eLuma spec grade',         cost: Math.max(0, (P.designFanLevels?.medium ?? 190) - fanDiskCredit) },
                  { value: 'high',   label: 'Ceiling fan (High finish)',   sub: 'custom/premium',           cost: Math.max(0, (P.designFanLevels?.high   ?? 270) - fanDiskCredit) },
                ]}
                value={ans.fanLevel}
                onChange={v => set('fanLevel', v)} impact={qc['units.fanLevel']}
              />

              <QuestionCard
                question='(Fans selected) 48" or upgrade to 52"?'
                note={`52" fans work better in larger or taller rooms.${(P.designUpgrades?.fanSize52Adder ?? 0) > 0 ? ` +$${P.designUpgrades.fanSize52Adder}/fan adder.` : ` No upcharge over the 48".`}`}
                costSuffix="/fan"
                options={[
                  { value: 'no',  label: '48" Fan — standard size',      cost: 0  },
                  { value: 'yes', label: '52" Fan — larger rooms/spaces', cost: P.designUpgrades?.fanSize52Adder ?? 25 },
                ]}
                value={ans.fanSize52}
                onChange={v => set('fanSize52', v)}
              />

              <QuestionCard
                question="(Fans selected) Light kit on the fans?"
                note="A light kit adds supplemental downlight to the fan. Informational — included in fan level pricing."
                options={[
                  { value: 'no',  label: 'No light kit',          cost: 0 },
                  { value: 'yes', label: 'Yes — include light kit', cost: 0 },
                ]}
                value={ans.fanLightKit}
                onChange={v => set('fanLightKit', v)}
              />

              <QuestionCard
                question="(Fans selected) Supplemental lighting in fan areas?"
                note="Supplemental downlights or accent lighting in fan rooms. Informational — enter specific budget in Project Data."
                options={[
                  { value: 'no',  label: 'No — fans only in these areas',                 cost: 0 },
                  { value: 'yes', label: 'Yes — additional supplemental lighting desired', cost: 0 },
                ]}
                value={ans.fanSupplemental}
                onChange={v => set('fanSupplemental', v)}
              />
            </>
          )}

          {isDesign && (
            <>
              <QuestionCard
                question='If ONLY ceiling lighting (no fan) — use (1) 12" disk or (4) 5"/7" disks in the living room?'
                note='(1) 12" disk is enough light for a standard room. (4) small disks cost ~$338 more with 4x labor.'
                options={[
                  { value: '1large', label: '(1) 12" Disk — cost-efficient, enough light', sub: '~$150 product + labor', cost: 0  },
                  { value: '4small', label: '(4) 5"/7" Disks — more even light spread',    sub: '+$34/unit adder',       cost: 34 },
                ]}
                value={ans.livingRoomDisks}
                onChange={v => set('livingRoomDisks', v)} impact={qc['units.livingRoomDisks']}
              />

              <QuestionCard
                question="Half-hot (switched) receptacles as an assumed light source if no ceiling lights are provided?"
                note="We believe half-hot receptacles do not provide a great tenant experience. Informational only."
                options={[
                  { value: 'no',  label: 'No — provide ceiling lighting in all rooms',         cost: 0 },
                  { value: 'yes', label: 'Yes — half-hot switched receptacles in some rooms',   cost: 0 },
                ]}
                value={ans.halfHotReceptacles}
                onChange={v => set('halfHotReceptacles', v)}
              />
            </>
          )}

        </div>
      </div>

      {/* ── BATHROOMS ────────────────────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Bathrooms</div>
        <div className="space-y-4">
          <QuestionCard
            question="How do you want to light bathroom vanities?"
            note='"Mirror and bath bar (Low finish)" is included in the base $0.38/SF. Illuminated mirrors eliminate the need for a separate mirror allowance and are often cost-neutral.'
            costSuffix="/vanity"
            options={[
              { value: 'bathBarLow',              label: 'Mirror and bath bar (Low finish)',        sub: 'Included in base budget',            cost: vanNet('bathBarLow')   },
              { value: 'illuminatedMirrorLow',    label: 'Illuminated mirror (Low finish)',    sub: 'Net of bath-bar base credit',        cost: vanNet('illuminatedMirrorLow') },
              { value: 'illuminatedMirrorMedium', label: 'Illuminated mirror (Medium finish)', cost: vanNet('illuminatedMirrorMedium') },
              { value: 'illuminatedMirrorHigh',   label: 'Illuminated mirror (High finish)',   cost: vanNet('illuminatedMirrorHigh') },
              { value: 'bathBarMedium',           label: 'Mirror and bath bar (Medium finish)',     cost: vanNet('bathBarMedium') },
              { value: 'bathBarHigh',             label: 'Mirror and bath bar (High finish)',       cost: vanNet('bathBarHigh') },
            ]}
            value={ans.vanity}
            onChange={v => set('vanity', v)} impact={qc['units.vanity']}
            override={{
              value:       ans.vanityPrice,
              onChange:    v => set('vanityPrice', v),
              masterPrice: vanNet(ans.vanity),
              suffix:      '/vanity',
              disabled:    ans.vanity === 'bathBarLow',
            }}
          />
        </div>
      </div>

      {/* ── BEDROOM CLOSETS (design only) ─────────────────────────────────────── */}
      {isDesign && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Bedroom Closets</div>
          <div className="space-y-4">
            <QuestionCard
              question="Control method for closet lights?"
              note="An occupancy sensor eliminates the need for a wall switch, saving ~$60/unit in product + labor."
              options={[
                { value: 'switch',    label: 'Wall switch (standard)',                                   cost: 0 },
                { value: 'occSensor', label: 'Occupancy sensor (removes switch)', sub: 'Saves ~$60/unit — recommended', cost: 0 },
              ]}
              value={ans.closetControl}
              onChange={v => set('closetControl', v)}
            />
          </div>
        </div>
      )}

      {/* ── BALCONIES (always shown; cost = answer × # of balconies in Project Data) ── */}
      {true && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Balconies</div>
          <div className="space-y-4">
            {isDesign && numBalconies === 0 && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                No balcony count entered in Project Data. Enter a count there to see cost impact — answers are saved regardless.
              </div>
            )}
            <QuestionCard
              question="Would you like a wall sconce, ceiling surface disk, or nothing on the balconies?"
              note={
                numBalconies > 0
                  ? `${numBalconies} balconies. If a sconce, consider its priority relative to the overall budget — sconces add meaningful cost per door. Cost shown is the net adder per balcony.`
                  : 'If a sconce, consider its priority relative to the overall budget — sconces add meaningful cost per balcony. Cost shown is the net adder per balcony.'
              }
              costSuffix="/balcony"
              options={[
                { value: 'none',         label: 'None',  cost: P.balcony.none.product },
                { value: 'disk5inch',    label: '5" surface mount disk', sub: 'Included in base', cost: P.balcony.disk5inch.product },
                { value: 'sconcelow',    label: 'Exterior balcony sconce (Low finish)',    sub: 'budget priority',  cost: P.balcony.sconcelow.product },
                { value: 'sconceMedium', label: 'Exterior balcony sconce (Medium finish)', sub: 'standard priority', cost: P.balcony.sconceMedium.product },
                { value: 'sconceHigh',   label: 'Exterior balcony sconce (High finish)',   sub: 'premium priority', cost: P.balcony.sconceHigh.product },
              ]}
              value={ans.balcony}
              onChange={v => set('balcony', v)} impact={qc['units.balcony']}
              override={{
                value:       ans.balconyPrice,
                onChange:    v => set('balconyPrice', v),
                masterPrice: P.balcony[ans.balcony]?.product,
                suffix:      '/balcony',
                disabled:    ans.balcony === 'none',
              }}
            />
          </div>
        </div>
      )}

      {/* Manual adder */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Manual Adder</div>
        <Input
          label="Residential Units manual adder"
          type="number"
          placeholder="0"
          hint="Add an arbitrary dollar amount to bump the units total (e.g. for custom scope)."
          prefix="$"
          value={ans.manualAdder}
          onChange={e => set('manualAdder', e.target.value)}
          min={0}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onPrev}>Back</Button>
        <Button variant="amber" size="lg" loading={saving} onClick={handleNext}>
          Save &amp; Continue to Corridors
        </Button>
      </div>
    </div>
  );
}
