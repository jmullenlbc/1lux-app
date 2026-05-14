'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import QuestionCard from './QuestionCard';
import { formatCurrency } from '@/lib/calculations';
import { PRICING } from '@/lib/pricing';
import StandardsHint from '@/components/wizard/StandardsHint';

const FAN_ROOMS = {
  none: 0, masterOnly: 1, livingRoomOnly: 1, masterAndLiving: 2,
  masterAndSecondary: 1.5, masterSecondaryLiving: 2.5,
  masterSecondaryTertiary: 2.5, masterSecondaryTertiaryLiving: 2.75,
};

export default function UnitsSection({ responses, projectData, onSaveResponses, onNext, onPrev, isDesign = false }) {
  const [ans, setAns] = useState(() => ({
    // ── Conceptual questions (always shown) ──────────────────────────────
    undercabinet:       responses.undercabinet       || 'none',
    kitchenPendants:    responses.kitchenPendants    || 'none',
    fans:               responses.fans               || 'none',
    vanity:             responses.vanity             || 'bathBarLow',
    balcony:            responses.balcony            || 'none',
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
  }));
  const [saving, setSaving] = useState(false);

  function set(k, v) { setAns(a => ({ ...a, [k]: v })); }

  const hasFans         = ans.fans !== 'none';
  const hasUndercab120v = ans.undercabinet === 'lineVoltage';

  const numUnits     = Number(projectData?.numUnits)    || 0;
  const unitsSf      = Number(projectData?.unitsSf)     || 0;
  const numVanities  = Number(projectData?.numVanities) || Number(projectData?.numBathrooms) || 0;
  const numBalconies = Number(projectData?.numBalconies)|| 0;
  const baseProduct  = unitsSf * PRICING.base.perSf;

  async function handleNext() {
    setSaving(true);
    const payload = { ...ans };
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
    }
    await onSaveResponses(payload);
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
            Base unit budget: {formatCurrency(baseProduct)} ({unitsSf.toLocaleString()} SF × ${PRICING.base.perSf}/SF).
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
              note='7" provides more light output and is recommended for higher ceilings.'
              options={[
                { value: '5inch', label: '5" Disk', sub: 'Standard — included in base', cost: 0 },
                { value: '7inch', label: '7" Disk', sub: '+$4/unit — slightly more light output', cost: 4 },
              ]}
              value={ans.diskSize}
              onChange={v => set('diskSize', v)}
            />

            <QuestionCard
              question="Statement at unit entries — larger disk, decorative mount, or typical?"
              note='12" disk adds ~$25/unit. Decorative surface mount ~$30/unit. No additional labor cost.'
              options={[
                { value: 'typical',    label: 'Typical — same disk as rest of unit', cost: 0 },
                { value: '12inch',     label: '12" Statement Disk at entry',         sub: '+$25/unit', cost: 25 },
                { value: 'decorative', label: 'Decorative Surface Mount at entry',   sub: '+$30/unit', cost: 30 },
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
              note="Dimmers add ~$25 each (product only). Typical locations: kitchen, living room, master bedroom."
              options={[
                { value: '0', label: 'No dimmers — basic on/off switching only', cost: 0   },
                { value: '1', label: '1 dimmer per unit',  sub: '+$25/unit',  cost: 25  },
                { value: '2', label: '2 dimmers per unit', sub: '+$50/unit',  cost: 50  },
                { value: '3', label: '3 dimmers per unit', sub: '+$75/unit',  cost: 75  },
                { value: '4', label: '4 dimmers per unit', sub: '+$100/unit', cost: 100 },
                { value: '5', label: '5 dimmers per unit', sub: '+$125/unit', cost: 125 },
                { value: '6', label: '6 dimmers per unit', sub: '+$150/unit', cost: 150 },
              ]}
              value={ans.dimmersPerUnit}
              onChange={v => set('dimmersPerUnit', v)}
            />

            <QuestionCard
              question="Include a disk in each unit HVAC / mechanical closet?"
              note='7" disk with integrated occupancy sensor. Code typically requires lighting in mechanical spaces.'
              options={[
                { value: 'no',  label: 'No',                                          cost: 0  },
                { value: 'yes', label: 'Yes — 7" disk w/ occupancy sensor', sub: '+$15/unit', cost: 15 },
              ]}
              value={ans.boilerRoom}
              onChange={v => set('boilerRoom', v)}
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
              { value: 'none',        label: 'None',                     cost: 0   },
              { value: 'lineVoltage', label: '120V Line Voltage',         sub: 'Integral power supply — +$90/unit',      cost: 90  },
              { value: 'lowVoltage',  label: 'Low Voltage LED Tape',      sub: 'Slim tape + remote driver — +$220/unit', cost: 220 },
            ]}
            value={ans.undercabinet}
            onChange={v => set('undercabinet', v)}
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
              { value: 'none',             label: 'None — standard ceiling disk',           cost: 0   },
              { value: 'threeSmallLow',    label: '(3) Small Pendants — Low Finish',        sub: '$40 ea',  cost: 120 },
              { value: 'threeSmallMedium', label: '(3) Small Pendants — Medium Finish',     sub: '$100 ea', cost: 300 },
              { value: 'twoMediumLow',     label: '(2) Medium Pendants — Low Finish',       sub: '$88 ea',  cost: 176 },
              { value: 'twoMediumMedium',  label: '(2) Medium Pendants — Medium Finish',    sub: '$165 ea', cost: 330 },
              { value: 'oneLarge',         label: '(1) Large Statement Pendant',            sub: '$275',    cost: 275 },
              { value: 'oneLinear',        label: '(1) Linear Pendant over island',         sub: '$242',    cost: 242 },
            ]}
            value={ans.kitchenPendants}
            onChange={v => set('kitchenPendants', v)}
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
              { value: 'none',                         label: 'No fans',                                                    sub: '—',                   cost: isDesign ? undefined : 0 },
              { value: 'masterOnly',                   label: 'Master bedroom only',                                        sub: '1 fan/unit',           cost: isDesign ? undefined : 105 },
              { value: 'livingRoomOnly',               label: 'Living room only',                                           sub: '1 fan/unit',           cost: isDesign ? undefined : 105 },
              { value: 'masterAndLiving',              label: 'Master bed + Living room',                                   sub: '2 fans/unit',          cost: isDesign ? undefined : 210 },
              { value: 'masterAndSecondary',           label: 'Master bed + Secondary bed',                                 sub: '~1.5 fans avg/unit',   cost: isDesign ? undefined : 158 },
              { value: 'masterSecondaryLiving',        label: 'Master bed / Secondary bed / Living room',                  sub: '~2.5 fans avg/unit',   cost: isDesign ? undefined : 263 },
              { value: 'masterSecondaryTertiary',      label: 'Master bed / Secondary bed / Tertiary bed',                 sub: '~2.5 fans avg/unit',   cost: isDesign ? undefined : 263 },
              { value: 'masterSecondaryTertiaryLiving',label: 'Master bed / Secondary bed / Tertiary bed + Living room',   sub: '~2.75 fans avg/unit',  cost: isDesign ? undefined : 289 },
            ]}
            value={ans.fans}
            onChange={v => set('fans', v)}
          />

          {isDesign && hasFans && (
            <>
              <QuestionCard
                question="(Fans selected) What level of ceiling fan?"
                note="Low = pull-chain builder grade. Medium = eLuma spec grade. High = custom/premium."
                costSuffix="/fan"
                options={[
                  { value: 'low',    label: 'Ceiling fan — Low',    sub: '$115 product / $142 net adder per fan', cost: 142 },
                  { value: 'medium', label: 'Ceiling fan — Medium', sub: '$175 product / $190 net adder per fan', cost: 190 },
                  { value: 'high',   label: 'Ceiling fan — High',   sub: '$300 product / $270 net adder per fan', cost: 270 },
                ]}
                value={ans.fanLevel}
                onChange={v => set('fanLevel', v)}
              />

              <QuestionCard
                question='(Fans selected) 48" or upgrade to 52"?'
                note='52" fans work better in larger or taller rooms. +$25/fan adder.'
                costSuffix="/fan"
                options={[
                  { value: 'no',  label: '48" Fan — standard size',      cost: 0  },
                  { value: 'yes', label: '52" Fan — larger rooms/spaces', sub: '+$25/fan', cost: 25 },
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
                onChange={v => set('livingRoomDisks', v)}
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
            note='"Mirror + Bath Bar (Low)" is included in the base $0.38/SF. Illuminated mirrors eliminate the need for a separate mirror allowance and are often cost-neutral.'
            costSuffix="/vanity"
            options={[
              { value: 'bathBarLow',              label: 'Mirror + LED Bath Bar — Low',        sub: 'Included in base budget',                   cost: 0   },
              { value: 'illuminatedMirrorLow',    label: 'Illuminated Mirror — Low Finish',    sub: 'Cost-neutral vs. bath bar + mirror',          cost: 0   },
              { value: 'illuminatedMirrorMedium', label: 'Illuminated Mirror — Medium Finish', sub: isDesign ? '+$155/vanity' : '+$100/vanity',   cost: isDesign ? 155 : 100 },
              { value: 'illuminatedMirrorHigh',   label: 'Illuminated Mirror — High Finish',   sub: isDesign ? '+$205/vanity' : '+$250/vanity',   cost: isDesign ? 205 : 250 },
              { value: 'bathBarMedium',           label: 'Mirror + LED Bath Bar — Medium',     sub: isDesign ? '+$80/vanity'  : '+$75/vanity',    cost: isDesign ? 80  : 75  },
              { value: 'bathBarHigh',             label: 'Mirror + LED Bath Bar — High',       sub: isDesign ? '+$205/vanity' : '+$175/vanity',   cost: isDesign ? 205 : 175 },
            ]}
            value={ans.vanity}
            onChange={v => set('vanity', v)}
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

      {/* ── BALCONIES ────────────────────────────────────────────────────────── */}
      {(numBalconies > 0 || isDesign) && (
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
                { value: 'none',         label: 'Nothing — no balcony fixture',          cost: 0   },
                { value: 'disk5inch',    label: '5" Ceiling Surface Mount Disk',         sub: 'Included in base', cost: 0   },
                { value: 'sconcelow',    label: 'Exterior Wall Sconce — Low',            sub: '+$55/balcony — budget priority', cost: 55  },
                { value: 'sconceMedium', label: 'Exterior Wall Sconce — Medium',         sub: '+$135/balcony — standard priority', cost: 135 },
                { value: 'sconceHigh',   label: 'Exterior Wall Sconce — High',           sub: '+$240/balcony — premium priority', cost: 240 },
              ]}
              value={ans.balcony}
              onChange={v => set('balcony', v)}
            />
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onPrev}>Back</Button>
        <Button variant="amber" size="lg" loading={saving} onClick={handleNext}>
          Save &amp; Continue to Corridors
        </Button>
      </div>
    </div>
  );
}
