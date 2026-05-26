/**
 * ILC Studios — Symbol Library
 * Derived from 5 Bluebeam .btx tool chest exports.
 * All 80 symbols defined here as React/SVG render functions.
 *
 * Visual standards (from BTX files):
 *   Stroke:       #FF0000  (red)
 *   Lighting fill: #FFFF80  (yellow-white, ~50% opacity)
 *   Controls fill: #FFFFFF  (white)
 *   Stroke width: 1.5px at standard zoom
 *
 * All symbol content renders into a 40×40 viewBox centered at (20,20).
 * The caller wraps content in <svg viewBox="0 0 40 40"> or a scaled <g>.
 */

// ── Color constants ───────────────────────────────────────────────────────────
export const SYM_STROKE   = '#FF0000';
export const SYM_FILL_L   = '#FFFF80';   // lighting symbols
export const SYM_FILL_C   = '#FFFFFF';   // controls symbols
export const SYM_FILL_OPA = '0.5';

// ── Master render function ────────────────────────────────────────────────────
/**
 * Returns JSX SVG children for a 0 0 40 40 coordinate space.
 * @param {string} symbolId  - e.g. 'INT_D_CIRCLE'
 * @param {string} stroke    - stroke color (override for selected state)
 * @param {string} fill      - fill color
 * @param {string} fillOpa   - fill opacity
 */
export function getSymbolContent(symbolId, stroke = SYM_STROKE, fill = SYM_FILL_L, fillOpa = SYM_FILL_OPA) {
  const c = stroke;
  const f = fill;
  const fo = fillOpa;
  const sw = '1.5';

  switch (symbolId) {

    // ══════════════════════════════════════════════════════════════════════════
    // INTERIOR + UNIT — RECESSED DOWNLIGHTS
    // ══════════════════════════════════════════════════════════════════════════

    case 'INT_D_CIRCLE':
    case 'UNIT_D_CIRCLE':
      // Outer circle filled + inner aperture ring at ~74% of outer (matches BTX)
      return <>
        <circle cx={20} cy={20} r={16} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={20} cy={20} r={12} stroke={c} strokeWidth={sw} fill="none"/>
      </>;

    case 'INT_D_SQUARE':
    case 'UNIT_D_SQUARE':
      return <rect x={5} y={5} width={30} height={30} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>;

    case 'INT_D_WW_CIRCLE':
    case 'UNIT_D_WW_CIRCLE':
      // Circle + inner aperture ring (~77% of outer) + directional arrow (wall washer)
      return <>
        <circle cx={17} cy={20} r={13} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={17} cy={20} r={10} stroke={c} strokeWidth={sw} fill="none"/>
        <polygon points="27,16 36,20 27,24" fill={c}/>
      </>;

    case 'INT_D_WW_SQUARE':
    case 'UNIT_D_WW_SQUARE':
      // Square (offset left) + directional arrow pointing right (wall washer)
      return <>
        <rect x={4} y={6} width={24} height={28} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <polygon points="28,14 38,20 28,26" fill={c}/>
      </>;

    // ── Stem / Surface Cylinder ───────────────────────────────────────────────

    case 'INT_N_CIRCLE':
    case 'UNIT_N_CIRCLE':
      // Circle + small center dot (not a ring like D)
      return <>
        <circle cx={20} cy={20} r={16} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={20} cy={20} r={4}  fill={c}/>
      </>;

    case 'INT_N_SQUARE':
    case 'UNIT_N_SQUARE':
      // Square + small filled center dot (matches BTX: solid dot not ring)
      return <>
        <rect x={5} y={5} width={30} height={30} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={20} cy={20} r={4} fill={c}/>
      </>;

    // ── Pendant ───────────────────────────────────────────────────────────────

    case 'INT_P':
    case 'UNIT_P':
      // Canopy rect at top + pendant drop + circle head + inner aperture ring
      return <>
        <rect x={8}  y={3}  width={24} height={5} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <line x1={20} y1={8} x2={20} y2={17} stroke={c} strokeWidth={sw}/>
        <circle cx={20} cy={27} r={11} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={20} cy={27} r={8}  stroke={c} strokeWidth={sw} fill="none"/>
      </>;

    // ── Surface Ceiling Mount ─────────────────────────────────────────────────

    case 'INT_C':
    case 'UNIT_C':
      // Circle + inner concentric ring + crosshairs (matches BTX ceiling mount symbol)
      return <>
        <circle cx={20} cy={20} r={16} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={20} cy={20} r={9}  stroke={c} strokeWidth={sw} fill="none"/>
        <line x1={20} y1={4}  x2={20} y2={36} stroke={c} strokeWidth={sw}/>
        <line x1={4}  y1={20} x2={36} y2={20} stroke={c} strokeWidth={sw}/>
      </>;

    // ── Wall Sconce / Vanity ──────────────────────────────────────────────────

    case 'INT_WV':
    case 'UNIT_WV':
      // Wall line (left) + horizontal arm + circle fixture head (standard wall sconce symbol)
      return <>
        <line x1={4} y1={4}   x2={4}  y2={36} stroke={c} strokeWidth="2.5"/>
        <line x1={4} y1={20}  x2={15} y2={20} stroke={c} strokeWidth={sw}/>
        <circle cx={28} cy={20} r={11} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={28} cy={20} r={4}  fill={c}/>
      </>;

    // ══════════════════════════════════════════════════════════════════════════
    // INTERIOR + UNIT — LINEAR FIXTURES
    // ══════════════════════════════════════════════════════════════════════════

    case 'INT_W_LINEAR':
    case 'UNIT_W_LINEAR':
      // Rect + wall-mount lines at each end
      return <>
        <line x1={3}  y1={11} x2={3}  y2={29} stroke={c} strokeWidth="2.5"/>
        <line x1={37} y1={11} x2={37} y2={29} stroke={c} strokeWidth="2.5"/>
        <rect x={3} y={16} width={34} height={8} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
      </>;

    case 'INT_A_LINEAR':
    case 'UNIT_A_LINEAR':
      // Pendant linear: rect + pendant-drop circles at each end
      return <>
        <rect x={5} y={21} width={30} height={8} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <line x1={10} y1={9}  x2={10} y2={21} stroke={c} strokeWidth={sw}/>
        <line x1={30} y1={9}  x2={30} y2={21} stroke={c} strokeWidth={sw}/>
        <circle cx={10} cy={7} r={4} stroke={c} strokeWidth={sw} fill="none"/>
        <circle cx={30} cy={7} r={4} stroke={c} strokeWidth={sw} fill="none"/>
      </>;

    case 'INT_B_TROFFER':
      // Recessed troffer: wide rect + vertical end-cap lines (matches BTX long rectangle + caps)
      return <>
        <rect x={2} y={14} width={36} height={12} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <line x1={2}  y1={10} x2={2}  y2={30} stroke={c} strokeWidth={sw}/>
        <line x1={38} y1={10} x2={38} y2={30} stroke={c} strokeWidth={sw}/>
      </>;

    case 'INT_R_LINEAR':
    case 'UNIT_R_LINEAR':
      // Plain architectural linear rect
      return <rect x={3} y={15} width={34} height={10} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>;

    case 'INT_R_WW':
    case 'UNIT_R_WW':
      // Linear wall wash: rect + wall-wash triangle above
      return <>
        <rect x={3} y={19} width={34} height={9} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <polygon points="20,7 28,19 12,19" fill={c}/>
      </>;

    case 'INT_S_STRIP':
    case 'UNIT_S_STRIP':
      // Capsule/stadium strip + mounting circle at center
      return <>
        <rect x={3} y={14} width={34} height={12} rx={6} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={20} cy={20} r={3} stroke={c} strokeWidth="1" fill="none"/>
      </>;

    case 'INT_Z_STEP':
    case 'UNIT_Z_STEP':
      // Wall box (rect left) + circle right
      return <>
        <rect x={3}  y={12} width={14} height={16} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={28} cy={20} r={10} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
      </>;

    case 'INT_L_TAPE':
    case 'UNIT_L_TAPE':
      // LED tape with channel: single line + dashed parallel (matches BTX "LINEAR LED TAPE WITH CHANNEL")
      return <>
        <line x1={3} y1={17} x2={37} y2={17} stroke={c} strokeWidth="2"/>
        <line x1={3} y1={23} x2={37} y2={23} stroke={c} strokeWidth="2" strokeDasharray="6 3"/>
      </>;

    // ── Multi-head recessed ───────────────────────────────────────────────────

    case 'INT_D_2HEAD':
    case 'UNIT_D_2HEAD':
      // Two unfilled circles side-by-side (matches BTX item 17)
      return <>
        <circle cx={11} cy={20} r={9}  stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={11} cy={20} r={7}  stroke={c} strokeWidth={sw} fill="none"/>
        <circle cx={29} cy={20} r={9}  stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={29} cy={20} r={7}  stroke={c} strokeWidth={sw} fill="none"/>
      </>;

    case 'INT_D_3HEAD':
    case 'UNIT_D_3HEAD':
      return <>
        {[8, 20, 32].map(x => (
          <g key={x}>
            <circle cx={x} cy={20} r={6} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
            <circle cx={x} cy={20} r={3} stroke={c} strokeWidth="1.1" fill="none"/>
          </g>
        ))}
      </>;

    case 'INT_D_4HEAD':
    case 'UNIT_D_4HEAD':
      return <>
        {[5, 15, 25, 35].map(x => (
          <g key={x}>
            <circle cx={x} cy={20} r={5}  stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
            <circle cx={x} cy={20} r={2}  stroke={c} strokeWidth="1" fill="none"/>
          </g>
        ))}
      </>;

    // ── Track ─────────────────────────────────────────────────────────────────

    case 'INT_T_TRACK':
      return <>
        <rect x={3} y={13} width={34} height={14} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <line x1={3} y1={20} x2={37} y2={20} stroke={c} strokeWidth="1.5"/>
        {/* track slots */}
        <line x1={10} y1={13} x2={10} y2={27} stroke={c} strokeWidth="0.75"/>
        <line x1={20} y1={13} x2={20} y2={27} stroke={c} strokeWidth="0.75"/>
        <line x1={30} y1={13} x2={30} y2={27} stroke={c} strokeWidth="0.75"/>
      </>;

    case 'INT_T_HEAD':
      // Track head: directional polygon + square body
      return <>
        <polygon points="20,5 33,22 7,22" stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <rect x={15} y={22} width={10} height={9} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
      </>;

    // ── Ceiling Fan ───────────────────────────────────────────────────────────

    case 'INT_F_FAN':
    case 'UNIT_F_FAN': {
      const blades = [0, 90, 180, 270].map(angle => {
        const rad = (angle * Math.PI) / 180;
        const bx  = 20 + Math.cos(rad) * 9;
        const by  = 20 + Math.sin(rad) * 9;
        return (
          <ellipse key={angle} cx={bx} cy={by} rx={4} ry={7}
            transform={`rotate(${angle}, ${bx}, ${by})`}
            fill={c} fillOpacity="0.45" stroke={c} strokeWidth="1"/>
        );
      });
      return <>
        {blades}
        <circle cx={20} cy={20} r={5} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={20} cy={20} r={2} fill={c}/>
      </>;
    }

    // ── Highbay / Garage (INTERIOR only) ─────────────────────────────────────

    case 'INT_HG_CIRCLE':
      return <>
        <circle cx={20} cy={24} r={13} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <line x1={13} y1={5} x2={13} y2={11} stroke={c} strokeWidth={sw}/>
        <line x1={27} y1={5} x2={27} y2={11} stroke={c} strokeWidth={sw}/>
        <line x1={11} y1={7} x2={29} y2={7} stroke={c} strokeWidth={sw}/>
      </>;

    case 'INT_HG_SQUARE':
      return <>
        <rect x={5} y={12} width={30} height={24} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <line x1={13} y1={5} x2={13} y2={12} stroke={c} strokeWidth={sw}/>
        <line x1={27} y1={5} x2={27} y2={12} stroke={c} strokeWidth={sw}/>
        <line x1={11} y1={7} x2={29} y2={7} stroke={c} strokeWidth={sw}/>
      </>;

    // ══════════════════════════════════════════════════════════════════════════
    // UNIT ONLY — J-BOX + RECEPTACLES
    // ══════════════════════════════════════════════════════════════════════════

    case 'UNIT_JBOX_CEIL':
      // Ceiling J-box: circle + "J" text
      return <>
        <circle cx={20} cy={20} r={16} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <text x={20} y={27} textAnchor="middle" fontSize="18" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">J</text>
      </>;

    case 'UNIT_JBOX_WALL':
      // Wall J-box: wall line + arm + circle + "J"
      return <>
        <line x1={3} y1={6}  x2={3}  y2={34} stroke={c} strokeWidth="2.5"/>
        <line x1={3} y1={20} x2={11} y2={20} stroke={c} strokeWidth={sw}/>
        <circle cx={24} cy={20} r={14} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <text x={24} y={26} textAnchor="middle" fontSize="14" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">J</text>
      </>;

    case 'UNIT_RECEPT_WALL':
      // Wall switched receptacle: wall + circle + outlet slots + ground
      return <>
        <line x1={3} y1={6}  x2={3}  y2={34} stroke={c} strokeWidth="2.5"/>
        <circle cx={23} cy={20} r={15} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <line x1={18} y1={13} x2={18} y2={20} stroke={c} strokeWidth="2"/>
        <line x1={28} y1={13} x2={28} y2={20} stroke={c} strokeWidth="2"/>
        <circle cx={23} cy={26} r={2.5} fill={c}/>
      </>;

    case 'UNIT_RECEPT_FLOOR':
      // Floor switched receptacle: floor line + circle + outlet slots
      return <>
        <line x1={4} y1={37} x2={36} y2={37} stroke={c} strokeWidth="2.5"/>
        <circle cx={20} cy={20} r={15} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <line x1={15} y1={13} x2={15} y2={20} stroke={c} strokeWidth="2"/>
        <line x1={25} y1={13} x2={25} y2={20} stroke={c} strokeWidth="2"/>
        <circle cx={20} cy={26} r={2.5} fill={c}/>
      </>;

    // ══════════════════════════════════════════════════════════════════════════
    // EXTERIOR LIGHTING
    // ══════════════════════════════════════════════════════════════════════════

    case 'EXT_EP_POLE':
      // Pole: thin column + square luminaire head at top
      return <>
        <rect x={16} y={4}  width={8}  height={20} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <rect x={11} y={24} width={18} height={12} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
      </>;

    case 'EXT_EU_SQUARE':
      // Ingrade uplight — square
      return <rect x={7} y={7} width={26} height={26} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>;

    case 'EXT_EU_CIRCLE':
      // Ingrade uplight — circle
      return <circle cx={20} cy={20} r={15} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>;

    case 'EXT_EH_HANDRAIL':
      // Handrail puck: small solid circle
      return <>
        <circle cx={20} cy={20} r={13} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={20} cy={20} r={5}  fill={c}/>
      </>;

    case 'EXT_EB_CIRCLE':
      // Bollard circle: circle + inner ring
      return <>
        <circle cx={20} cy={20} r={15} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={20} cy={20} r={7}  stroke={c} strokeWidth={sw} fill="none"/>
      </>;

    case 'EXT_EB_SQUARE':
      // Bollard square: square + inner square
      return <>
        <rect x={5}  y={5}  width={30} height={30} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <rect x={11} y={11} width={18} height={18} stroke={c} strokeWidth={sw} fill="none"/>
      </>;

    case 'EXT_EF_FLOOD': {
      // Exterior flood: aim arrow polygon + small circle (lens)
      const pts = '20,4 33,24 27,24 27,36 13,36 13,24 7,24';
      return <>
        <polygon points={pts} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <circle cx={20} cy={16} r={5} stroke={c} strokeWidth="1" fill={c}/>
      </>;
    }

    case 'EXT_EZ_STEP':
      // Exterior step light (dashed wall box = exterior)
      return <>
        <rect x={3} y={11} width={14} height={18}
          stroke={c} strokeWidth={sw} fill="none" strokeDasharray="3 2"/>
        <circle cx={28} cy={20} r={11} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
      </>;

    case 'EXT_EW_WALL':
      // Exterior wall sconce/wall pack: wall + arm + circle
      return <>
        <line x1={4} y1={6}  x2={4}  y2={34} stroke={c} strokeWidth="2.5"/>
        <line x1={4} y1={20} x2={14} y2={20} stroke={c} strokeWidth={sw}/>
        <circle cx={26} cy={20} r={12} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
      </>;

    // ══════════════════════════════════════════════════════════════════════════
    // CONTROLS  (white fill)
    // ══════════════════════════════════════════════════════════════════════════

    case 'CTRL_REMOTE_PS':
      return <>
        <rect x={5} y={5} width={30} height={30} stroke={c} strokeWidth={sw} fill={SYM_FILL_C}/>
        <text x={20} y={25} textAnchor="middle" fontSize="11" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">PS</text>
      </>;

    case 'CTRL_SW_SINGLE':
      // S with wall indicator lines
      return <>
        <line x1={4} y1={7}  x2={4}  y2={33} stroke={c} strokeWidth="2.5"/>
        <line x1={10} y1={14} x2={22} y2={8} stroke={c} strokeWidth={sw}/>
        <text x={22} y={30} textAnchor="middle" fontSize="18" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">S</text>
      </>;

    case 'CTRL_SW_3WAY':
      return <>
        <line x1={4} y1={7}  x2={4}  y2={33} stroke={c} strokeWidth="2.5"/>
        <line x1={10} y1={14} x2={22} y2={8} stroke={c} strokeWidth={sw}/>
        <text x={20} y={29} textAnchor="middle" fontSize="16" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">S</text>
        <text x={31} y={33} textAnchor="middle" fontSize="10" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">3</text>
      </>;

    case 'CTRL_SW_4WAY':
      return <>
        <line x1={4} y1={7}  x2={4}  y2={33} stroke={c} strokeWidth="2.5"/>
        <line x1={10} y1={14} x2={22} y2={8} stroke={c} strokeWidth={sw}/>
        <text x={20} y={29} textAnchor="middle" fontSize="16" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">S</text>
        <text x={31} y={33} textAnchor="middle" fontSize="10" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">4</text>
      </>;

    case 'CTRL_SW_ELV':
      return <>
        <line x1={4} y1={7}  x2={4}  y2={33} stroke={c} strokeWidth="2.5"/>
        <line x1={10} y1={14} x2={22} y2={8} stroke={c} strokeWidth={sw}/>
        <text x={20} y={29} textAnchor="middle" fontSize="16" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">S</text>
        <text x={31} y={33} textAnchor="middle" fontSize="10" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">D</text>
      </>;

    case 'CTRL_OCC_CEIL':
      // Ceiling occ sensor: circle with OCC label
      return <>
        <circle cx={20} cy={20} r={16} stroke={c} strokeWidth={sw} fill={SYM_FILL_C}/>
        <text x={20} y={24} textAnchor="middle" fontSize="9" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">OCC</text>
      </>;

    case 'CTRL_OCC_WALL':
      return <>
        <line x1={4} y1={7}  x2={4}  y2={33} stroke={c} strokeWidth="2.5"/>
        <line x1={10} y1={14} x2={22} y2={8} stroke={c} strokeWidth={sw}/>
        <text x={19} y={27} textAnchor="middle" fontSize="14" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">S</text>
        <text x={30} y={32} textAnchor="middle" fontSize="8" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">OS</text>
      </>;

    case 'CTRL_TIMER':
      return <>
        <line x1={4} y1={7}  x2={4}  y2={33} stroke={c} strokeWidth="2.5"/>
        <line x1={10} y1={14} x2={22} y2={8} stroke={c} strokeWidth={sw}/>
        <text x={20} y={29} textAnchor="middle" fontSize="16" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">S</text>
        <text x={31} y={33} textAnchor="middle" fontSize="10" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">T</text>
      </>;

    case 'CTRL_010V':
      // 0-10V dimmer: "Z" with connector line
      return <>
        <text x={15} y={28} textAnchor="middle" fontSize="22" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">Z</text>
        <line x1={24} y1={10} x2={37} y2={20} stroke={c} strokeWidth={sw}/>
        <circle cx={37} cy={20} r={2} fill={c}/>
      </>;

    case 'CTRL_KEYPAD':
      return <>
        <line x1={4} y1={7}  x2={4}  y2={33} stroke={c} strokeWidth="2.5"/>
        <line x1={10} y1={14} x2={22} y2={8} stroke={c} strokeWidth={sw}/>
        <text x={20} y={29} textAnchor="middle" fontSize="16" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">S</text>
        <text x={31} y={33} textAnchor="middle" fontSize="10" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">K</text>
      </>;

    case 'CTRL_KEYPAD_AMEN':
      // Keypad K (amenities) with connector line
      return <>
        <text x={14} y={28} textAnchor="middle" fontSize="22" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">K</text>
        <line x1={24} y1={10} x2={37} y2={20} stroke={c} strokeWidth={sw}/>
        <circle cx={37} cy={20} r={2} fill={c}/>
      </>;

    // ══════════════════════════════════════════════════════════════════════════
    // LIGHTING TOOLS (utility / annotation)
    // ══════════════════════════════════════════════════════════════════════════

    case 'TOOL_POLY_AREA':
      return <>
        <polygon points="20,4 36,28 28,36 12,36 4,28" stroke={c} strokeWidth={sw} fill={f} fillOpacity="0.25"/>
        <text x={20} y={26} textAnchor="middle" fontSize="8" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">AREA</text>
      </>;

    case 'TOOL_CENTERLINE':
      // C label + centerline dash-dot line
      return <>
        <text x={9} y={26} textAnchor="middle" fontSize="14" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">C</text>
        <line x1={18} y1={20} x2={37} y2={20}
          stroke={c} strokeWidth={sw} strokeDasharray="6 2 1 2"/>
      </>;

    case 'TOOL_X':
      // X mark (fills submittal boxes)
      return (
        <text x={20} y={28} textAnchor="middle" fontSize="24" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">X</text>
      );

    case 'TOOL_REMOVE':
      // Crossed lines — marks fixture for removal/demolition
      return <>
        <line x1={5}  y1={5}  x2={35} y2={35} stroke={c} strokeWidth="2.5"/>
        <line x1={35} y1={5}  x2={5}  y2={35} stroke={c} strokeWidth="2.5"/>
      </>;

    case 'TOOL_STAMP_DATE':
      return <>
        <rect x={3} y={12} width={34} height={16} stroke={c} strokeWidth={sw} fill="none"/>
        <text x={20} y={25} textAnchor="middle" fontSize="7.5" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">XX/XX/XX</text>
      </>;

    case 'TOOL_ILC_LOGO':
      // ILC logo placeholder
      return <>
        <rect x={3} y={7} width={34} height={26} stroke={c} strokeWidth={sw} fill="none"/>
        <text x={20} y={24} textAnchor="middle" fontSize="12" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">ILC</text>
      </>;

    case 'TOOL_SUBMITTAL_BLOCK':
      // Submittal stamp composite (placeholder icon)
      return <>
        <rect x={3} y={3} width={34} height={34} stroke={c} strokeWidth={sw} fill="none"/>
        <line x1={3} y1={12} x2={37} y2={12} stroke={c} strokeWidth="0.8"/>
        <line x1={3} y1={22} x2={37} y2={22} stroke={c} strokeWidth="0.8"/>
        <text x={20} y={10} textAnchor="middle" fontSize="6" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">ILC</text>
        <text x={20} y={19} textAnchor="middle" fontSize="5"
          fill={c} fontFamily="Arial, sans-serif">PROJECT INFO</text>
        <text x={20} y={30} textAnchor="middle" fontSize="5"
          fill={c} fontFamily="Arial, sans-serif">DATE / SIG</text>
      </>;

    case 'TOOL_DIM_1_5':
    case 'TOOL_DIM_2':
    case 'TOOL_DIM_2_5':
    case 'TOOL_DIM_3':
    case 'TOOL_DIM_4': {
      const labels = {
        TOOL_DIM_1_5: "1.5'", TOOL_DIM_2: "2'",
        TOOL_DIM_2_5: "2.5'", TOOL_DIM_3: "3'", TOOL_DIM_4: "4'",
      };
      const lbl = labels[symbolId];
      return <>
        {/* dimension line */}
        <line x1={8}  y1={22} x2={32} y2={22} stroke={c} strokeWidth={sw}/>
        {/* arrowheads */}
        <polygon points="8,18 3,22 8,26"  fill={c}/>
        <polygon points="32,18 37,22 32,26" fill={c}/>
        {/* tick marks */}
        <line x1={8}  y1={26} x2={8}  y2={34} stroke={c} strokeWidth={sw}/>
        <line x1={32} y1={26} x2={32} y2={34} stroke={c} strokeWidth={sw}/>
        {/* label */}
        <text x={20} y={17} textAnchor="middle" fontSize="9" fontWeight="700"
          fill={c} fontFamily="Arial, sans-serif">{lbl}</text>
        <text x={20} y={11} textAnchor="middle" fontSize="6"
          fill={c} fontFamily="Arial, sans-serif">AFF</text>
      </>;
    }

    case 'TOOL_CLOUD':
      // Revision cloud — clockwise bumpy-arc rectangle (4,14)→(36,30)
      return <path
        d="M4,30 A4,4 0 0 1 12,30 A4,4 0 0 1 20,30 A4,4 0 0 1 28,30 A4,4 0 0 1 36,30 A4,4 0 0 1 36,22 A4,4 0 0 1 36,14 A4,4 0 0 1 28,14 A4,4 0 0 1 20,14 A4,4 0 0 1 12,14 A4,4 0 0 1 4,14 A4,4 0 0 1 4,22 A4,4 0 0 1 4,30 Z"
        stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>;

    case 'TOOL_CALLOUT':
      // Text callout: dot at lower-left, leader line, text box at upper-right
      return <>
        <circle cx={7} cy={33} r={3} fill={c}/>
        <line x1={7} y1={33} x2={17} y2={21} stroke={c} strokeWidth={sw}/>
        <rect x={15} y={5} width={23} height={17} rx={2} stroke={c} strokeWidth={sw} fill={f} fillOpacity={fo}/>
        <line x1={18} y1={11} x2={35} y2={11} stroke={c} strokeWidth="1"/>
        <line x1={18} y1={15} x2={32} y2={15} stroke={c} strokeWidth="1"/>
        <line x1={18} y1={19} x2={35} y2={19} stroke={c} strokeWidth="1"/>
      </>;

    default:
      return <>
        <circle cx={20} cy={20} r={14} stroke={c} strokeWidth={sw} fill="none"/>
        <text x={20} y={24} textAnchor="middle" fontSize="7" fill={c} fontFamily="monospace">
          {symbolId?.slice(-6) ?? '?'}
        </text>
      </>;
  }
}

// ── Toolbar icon component ────────────────────────────────────────────────────
/**
 * Small SVG icon for the tool palette grid.
 * @param {string} id        - symbol ID
 * @param {number} size      - rendered width/height in px (default 32)
 * @param {boolean} selected - highlighted/active state
 */
export function SymbolIcon({ id, size = 32, selected = false }) {
  const stroke  = selected ? '#fff'     : SYM_STROKE;
  const fill    = selected ? '#8B0000'  : SYM_FILL_L;
  const fillOpa = selected ? '0.7'      : SYM_FILL_OPA;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none"
      style={{ display: 'block', overflow: 'visible' }}>
      {getSymbolContent(id, stroke, fill, fillOpa)}
    </svg>
  );
}

// ── Inline pixel conversion (avoids circular import with scaleSystem.js) ────────
const _PDF_DPI = 72;
function _toPx(realWorldInches, scaleRatio, pdfScale) {
  return realWorldInches * scaleRatio * _PDF_DPI * pdfScale;
}

// ── Canvas marker component (point / non-linear symbols) ─────────────────────
/**
 * Renders a symbol on the SVG overlay positioned at (cx, cy).
 *
 * Preferred: pass scaleRatio + pdfScale for scale-aware sizing.
 * Fallback:  pass symSize (canvas px) if scale params not available.
 *
 * @param {string}  symbolId   - e.g. 'INT_D_CIRCLE'
 * @param {number}  cx         - center x in canvas pixels
 * @param {number}  cy         - center y in canvas pixels
 * @param {string}  typeCode   - callout label shown next to symbol
 * @param {boolean} confirmed  - fixture is confirmed
 * @param {boolean} selected   - fixture is selected
 * @param {number}  scaleRatio - drawing scale ratio (e.g. 1/48)
 * @param {number}  pdfScale   - pdfjs render scale (default 1.5)
 * @param {number}  symSize    - fallback canvas px when scale params absent
 */
export function CanvasSymbol({
  symbolId, cx, cy, typeCode, confirmed, selected,
  scaleRatio, pdfScale = 1.5,
  symSize = 28,
}) {
  const sym = SYMBOL_MAP[symbolId];

  // Determine rendered pixel size
  let sizePx;
  if (sym?.isFixedSize) {
    sizePx = 20; // CONTROLS_FIXED_PX — always 20px regardless of drawing scale
  } else if (scaleRatio) {
    sizePx = Math.max(8, _toPx(sym?.symInches ?? 8, scaleRatio, pdfScale));
  } else {
    sizePx = symSize;
  }

  const scale  = sizePx / 40;
  const stroke = selected  ? '#f59e0b'
               : confirmed ? '#22c55e'
               : SYM_STROKE;
  const fill   = selected  ? '#fef3c7'
               : confirmed ? '#dcfce7'
               : SYM_FILL_L;
  const fillOp = '0.65';

  // Translate so symbol center (20,20) maps to (cx,cy), then scale
  const tx = cx - 20 * scale;
  const ty = cy - 20 * scale;

  return (
    <g>
      <g transform={`translate(${tx},${ty}) scale(${scale})`}>
        {getSymbolContent(symbolId, stroke, fill, fillOp)}
      </g>

      {(selected || confirmed) && (
        <circle cx={cx} cy={cy} r={sizePx / 2 + 3}
          stroke={stroke} strokeWidth="2"
          strokeDasharray={confirmed ? 'none' : '4 2'}
          fill="none"/>
      )}

      {typeCode && (
        <text x={cx + sizePx / 2 + 4} y={cy + 4}
          fontSize="10" fontWeight="700" fontFamily="Arial, sans-serif"
          fill={stroke}>
          {typeCode}
        </text>
      )}
    </g>
  );
}

// ── Canvas linear symbol (two-click placed fixtures) ─────────────────────────
/**
 * Renders a linear fixture between two canvas-pixel points.
 * The symbol is stretched horizontally from (x1,y1) to (x2,y2) and the
 * cross-section height comes from sym.symInches → canvas pixels.
 *
 * @param {string}  symbolId    - e.g. 'INT_R_LINEAR'
 * @param {number}  x1,y1       - start point (canvas px)
 * @param {number}  x2,y2       - end point (canvas px)
 * @param {string}  typeCode    - callout label
 * @param {boolean} confirmed
 * @param {boolean} selected
 * @param {number}  scaleRatio  - drawing scale ratio
 * @param {number}  pdfScale    - pdfjs render scale
 * @param {string}  lengthLabel - formatted dimension string (e.g. "4'−6"")
 */
export function CanvasLinearSymbol({
  symbolId, x1, y1, x2, y2,
  typeCode, confirmed, selected,
  scaleRatio, pdfScale = 1.5,
  lengthLabel,
}) {
  const sym = SYMBOL_MAP[symbolId];

  const dx  = x2 - x1;
  const dy  = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return null;

  const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);

  // Cross-section height in canvas pixels
  const heightPx = scaleRatio
    ? Math.max(6, _toPx(sym?.symInches ?? 4, scaleRatio, pdfScale))
    : 12;

  const stroke = selected  ? '#f59e0b'
               : confirmed ? '#22c55e'
               : SYM_STROKE;
  const fill   = selected  ? '#fef3c7'
               : confirmed ? '#dcfce7'
               : SYM_FILL_L;

  // Scale the 40×40 viewBox to (len × heightPx)
  const sx = len  / 40;
  const sy = heightPx / 40;

  return (
    <g transform={`translate(${x1},${y1}) rotate(${angleDeg})`}>
      {/* Symbol content stretched to fill the run */}
      <g transform={`scale(${sx},${sy})`}>
        {getSymbolContent(symbolId, stroke, fill, '0.65')}
      </g>

      {/* Endpoint dots */}
      <circle cx={0}   cy={0} r={3} fill={stroke}/>
      <circle cx={len} cy={0} r={3} fill={stroke}/>

      {/* Selection outline */}
      {(selected || confirmed) && (
        <rect x={0} y={-heightPx / 2 - 2} width={len} height={heightPx + 4}
          stroke={stroke} strokeWidth="1.5"
          strokeDasharray={confirmed ? 'none' : '4 2'}
          fill="none"/>
      )}

      {/* Dimension label at midpoint, above the run */}
      {lengthLabel && (
        <text
          x={len / 2} y={-heightPx / 2 - 4}
          textAnchor="middle"
          fontSize="9" fontWeight="600" fontFamily="Arial, sans-serif"
          fill={stroke}
          transform={`rotate(${-angleDeg}, ${len / 2}, ${-heightPx / 2 - 4})`}>
          {lengthLabel}
        </text>
      )}

      {/* Callout label at end */}
      {typeCode && (
        <text x={len + 4} y={4}
          fontSize="10" fontWeight="700" fontFamily="Arial, sans-serif"
          fill={stroke}>
          {typeCode}
        </text>
      )}
    </g>
  );
}

// ── Symbol metadata catalog ───────────────────────────────────────────────────
//
// symInches  — real-world diameter / side / cross-section height in inches.
//              Used by CanvasSymbol/CanvasLinearSymbol to scale the symbol to
//              the current drawing scale via toPixels().
// isFixedSize — true: symbol renders at CONTROLS_FIXED_PX (20px) regardless of
//              drawing scale. Used for wall-mounted controls / annotation tools.
//              Physical ceiling sensors (OCC_CEIL, REMOTE_PS) are NOT fixed.
//
export const SYMBOLS = [
  // ── INTERIOR (25) ──────────────────────────────────────────────────────────
  { id: 'INT_D_CIRCLE',    label: '"D" TYPE',   desc: 'Recessed Downlight',             toolset: 'INTERIOR', family: 'D', isLinear: false, symInches:  8, isFixedSize: false },
  { id: 'INT_D_SQUARE',    label: '"D" TYPE',   desc: 'Recessed Downlight (Square)',    toolset: 'INTERIOR', family: 'D', isLinear: false, symInches:  8, isFixedSize: false },
  { id: 'INT_D_WW_CIRCLE', label: '"D" TYPE',   desc: 'Recessed Wall Washer (Circle)', toolset: 'INTERIOR', family: 'D', isLinear: false, symInches:  8, isFixedSize: false },
  { id: 'INT_D_WW_SQUARE', label: '"D" TYPE',   desc: 'Recessed Wall Washer (Square)', toolset: 'INTERIOR', family: 'D', isLinear: false, symInches:  8, isFixedSize: false },
  { id: 'INT_N_CIRCLE',    label: '"N" TYPE',   desc: 'Surface Cylinder (Circle)',      toolset: 'INTERIOR', family: 'N', isLinear: false, symInches:  8, isFixedSize: false },
  { id: 'INT_N_SQUARE',    label: '"N" TYPE',   desc: 'Surface Cylinder (Square)',      toolset: 'INTERIOR', family: 'N', isLinear: false, symInches:  8, isFixedSize: false },
  { id: 'INT_P',           label: '"P" TYPE',   desc: 'Pendant',                        toolset: 'INTERIOR', family: 'P', isLinear: false, symInches: 12, isFixedSize: false },
  { id: 'INT_C',           label: '"C" TYPE',   desc: 'Surface Ceiling Mount',          toolset: 'INTERIOR', family: 'C', isLinear: false, symInches: 10, isFixedSize: false },
  { id: 'INT_WV',          label: '"W/V" TYPE', desc: 'Wall Sconce / Vanity',           toolset: 'INTERIOR', family: 'W', isLinear: false, symInches: 10, isFixedSize: false },
  { id: 'INT_D_2HEAD',     label: '"D" 2-Head', desc: 'Recessed 2-Head',               toolset: 'INTERIOR', family: 'D', isLinear: false, symInches: 14, isFixedSize: false },
  { id: 'INT_D_3HEAD',     label: '"D" 3-Head', desc: 'Recessed 3-Head',               toolset: 'INTERIOR', family: 'D', isLinear: false, symInches: 18, isFixedSize: false },
  { id: 'INT_D_4HEAD',     label: '"D" 4-Head', desc: 'Recessed 4-Head',               toolset: 'INTERIOR', family: 'D', isLinear: false, symInches: 22, isFixedSize: false },
  { id: 'INT_F_FAN',       label: '"F" TYPE',   desc: 'Ceiling Fan',                   toolset: 'INTERIOR', family: 'F', isLinear: false, symInches: 16, isFixedSize: false },
  { id: 'INT_HG_CIRCLE',   label: '"H/G" TYPE', desc: 'Highbay / Garage (Circle)',     toolset: 'INTERIOR', family: 'H', isLinear: false, symInches: 14, isFixedSize: false },
  { id: 'INT_HG_SQUARE',   label: '"H/G" TYPE', desc: 'Highbay / Garage (Square)',     toolset: 'INTERIOR', family: 'H', isLinear: false, symInches: 14, isFixedSize: false },
  { id: 'INT_W_LINEAR',    label: '"W" TYPE',   desc: 'Wall Mounted Linear',           toolset: 'INTERIOR', family: 'W', isLinear: true,  symInches:  4, isFixedSize: false },
  { id: 'INT_A_LINEAR',    label: '"A" TYPE',   desc: 'Pendant Mounted Linear',        toolset: 'INTERIOR', family: 'A', isLinear: true,  symInches:  4, isFixedSize: false },
  { id: 'INT_B_TROFFER',   label: '"B" TYPE',   desc: 'Recessed Troffer',              toolset: 'INTERIOR', family: 'B', isLinear: true,  symInches:  4, isFixedSize: false },
  { id: 'INT_R_LINEAR',    label: '"R" TYPE',   desc: 'Architectural Linear',          toolset: 'INTERIOR', family: 'R', isLinear: true,  symInches:  4, isFixedSize: false },
  { id: 'INT_R_WW',        label: '"R" TYPE',   desc: 'Linear Wall Wash',              toolset: 'INTERIOR', family: 'R', isLinear: true,  symInches:  4, isFixedSize: false },
  { id: 'INT_S_STRIP',     label: '"S" TYPE',   desc: 'Surface / Suspended Strip',     toolset: 'INTERIOR', family: 'S', isLinear: true,  symInches:  4, isFixedSize: false },
  { id: 'INT_Z_STEP',      label: '"Z" TYPE',   desc: 'Wall Recessed Steplight',       toolset: 'INTERIOR', family: 'Z', isLinear: false, symInches:  6, isFixedSize: false },
  { id: 'INT_L_TAPE',      label: '"L" TYPE',   desc: 'Linear LED Tape w/ Channel',   toolset: 'INTERIOR', family: 'L', isLinear: true,  symInches:  3, isFixedSize: false },
  { id: 'INT_T_TRACK',     label: '"T" TYPE',   desc: 'Track System',                  toolset: 'INTERIOR', family: 'T', isLinear: true,  symInches:  4, isFixedSize: false },
  { id: 'INT_T_HEAD',      label: '"T" TYPE',   desc: 'Track Head',                    toolset: 'INTERIOR', family: 'T', isLinear: false, symInches:  6, isFixedSize: false },
  // ── UNIT (24) ──────────────────────────────────────────────────────────────
  { id: 'UNIT_D_CIRCLE',    label: '"D" TYPE',   desc: 'Recessed Downlight',           toolset: 'UNIT', family: 'D', isLinear: false, symInches:  8, isFixedSize: false },
  { id: 'UNIT_D_SQUARE',    label: '"D" TYPE',   desc: 'Recessed Downlight (Square)',  toolset: 'UNIT', family: 'D', isLinear: false, symInches:  8, isFixedSize: false },
  { id: 'UNIT_D_WW_CIRCLE', label: '"D" TYPE',   desc: 'Recessed Wall Washer (Circle)',toolset: 'UNIT', family: 'D', isLinear: false, symInches:  8, isFixedSize: false },
  { id: 'UNIT_D_WW_SQUARE', label: '"D" TYPE',   desc: 'Recessed Wall Washer (Square)',toolset: 'UNIT', family: 'D', isLinear: false, symInches:  8, isFixedSize: false },
  { id: 'UNIT_N_CIRCLE',    label: '"N" TYPE',   desc: 'Surface Cylinder (Circle)',    toolset: 'UNIT', family: 'N', isLinear: false, symInches:  8, isFixedSize: false },
  { id: 'UNIT_N_SQUARE',    label: '"N" TYPE',   desc: 'Surface Cylinder (Square)',    toolset: 'UNIT', family: 'N', isLinear: false, symInches:  8, isFixedSize: false },
  { id: 'UNIT_P',           label: '"P" TYPE',   desc: 'Pendant',                      toolset: 'UNIT', family: 'P', isLinear: false, symInches: 12, isFixedSize: false },
  { id: 'UNIT_C',           label: '"C" TYPE',   desc: 'Surface Ceiling Mount',        toolset: 'UNIT', family: 'C', isLinear: false, symInches: 10, isFixedSize: false },
  { id: 'UNIT_WV',          label: '"W/V" TYPE', desc: 'Wall Sconce / Vanity',         toolset: 'UNIT', family: 'W', isLinear: false, symInches: 10, isFixedSize: false },
  { id: 'UNIT_D_2HEAD',     label: '"D" 2-Head', desc: 'Recessed 2-Head',             toolset: 'UNIT', family: 'D', isLinear: false, symInches: 14, isFixedSize: false },
  { id: 'UNIT_D_3HEAD',     label: '"D" 3-Head', desc: 'Recessed 3-Head',             toolset: 'UNIT', family: 'D', isLinear: false, symInches: 18, isFixedSize: false },
  { id: 'UNIT_D_4HEAD',     label: '"D" 4-Head', desc: 'Recessed 4-Head',             toolset: 'UNIT', family: 'D', isLinear: false, symInches: 22, isFixedSize: false },
  { id: 'UNIT_F_FAN',       label: '"F" TYPE',   desc: 'Ceiling Fan',                  toolset: 'UNIT', family: 'F', isLinear: false, symInches: 16, isFixedSize: false },
  { id: 'UNIT_W_LINEAR',    label: '"W" TYPE',   desc: 'Wall Mounted Linear',          toolset: 'UNIT', family: 'W', isLinear: true,  symInches:  4, isFixedSize: false },
  { id: 'UNIT_A_LINEAR',    label: '"A" TYPE',   desc: 'Pendant Mounted Linear',       toolset: 'UNIT', family: 'A', isLinear: true,  symInches:  4, isFixedSize: false },
  { id: 'UNIT_R_LINEAR',    label: '"R" TYPE',   desc: 'Architectural Linear',         toolset: 'UNIT', family: 'R', isLinear: true,  symInches:  4, isFixedSize: false },
  { id: 'UNIT_R_WW',        label: '"R" TYPE',   desc: 'Linear Wall Wash',             toolset: 'UNIT', family: 'R', isLinear: true,  symInches:  4, isFixedSize: false },
  { id: 'UNIT_S_STRIP',     label: '"S" TYPE',   desc: 'Surface / Suspended Strip',    toolset: 'UNIT', family: 'S', isLinear: true,  symInches:  4, isFixedSize: false },
  { id: 'UNIT_Z_STEP',      label: '"Z" TYPE',   desc: 'Wall Recessed Steplight',      toolset: 'UNIT', family: 'Z', isLinear: false, symInches:  6, isFixedSize: false },
  { id: 'UNIT_L_TAPE',      label: '"L" TYPE',   desc: 'Linear LED Tape w/ Channel',  toolset: 'UNIT', family: 'L', isLinear: true,  symInches:  3, isFixedSize: false },
  { id: 'UNIT_JBOX_CEIL',   label: 'J-BOX',      desc: 'Ceiling J-Box',                toolset: 'UNIT', family: 'J', isLinear: false, symInches:  4, isFixedSize: false },
  { id: 'UNIT_JBOX_WALL',   label: 'J-BOX',      desc: 'Wall J-Box',                   toolset: 'UNIT', family: 'J', isLinear: false, symInches:  4, isFixedSize: false },
  { id: 'UNIT_RECEPT_WALL', label: 'RECEPT',     desc: 'Wall Switched Receptacle',     toolset: 'UNIT', family: 'R', isLinear: false, symInches:  6, isFixedSize: false },
  { id: 'UNIT_RECEPT_FLOOR',label: 'RECEPT',     desc: 'Floor Switched Receptacle',    toolset: 'UNIT', family: 'R', isLinear: false, symInches:  6, isFixedSize: false },
  // ── EXTERIOR (9) ───────────────────────────────────────────────────────────
  { id: 'EXT_EP_POLE',    label: '"EP" TYPE', desc: 'Area / Pedestrian Pole',          toolset: 'EXTERIOR', family: 'EP', isLinear: false, symInches: 12, isFixedSize: false },
  { id: 'EXT_EU_SQUARE',  label: '"EU" TYPE', desc: 'Ingrade Uplight (Square)',        toolset: 'EXTERIOR', family: 'EU', isLinear: false, symInches:  8, isFixedSize: false },
  { id: 'EXT_EU_CIRCLE',  label: '"EU" TYPE', desc: 'Ingrade Uplight (Circle)',        toolset: 'EXTERIOR', family: 'EU', isLinear: false, symInches:  8, isFixedSize: false },
  { id: 'EXT_EH_HANDRAIL',label: '"EH" TYPE', desc: 'Handrail Puck',                  toolset: 'EXTERIOR', family: 'EH', isLinear: false, symInches:  4, isFixedSize: false },
  { id: 'EXT_EB_CIRCLE',  label: '"EB" TYPE', desc: 'Bollard (Circle)',                toolset: 'EXTERIOR', family: 'EB', isLinear: false, symInches: 10, isFixedSize: false },
  { id: 'EXT_EB_SQUARE',  label: '"EB" TYPE', desc: 'Bollard (Square)',                toolset: 'EXTERIOR', family: 'EB', isLinear: false, symInches: 10, isFixedSize: false },
  { id: 'EXT_EF_FLOOD',   label: '"EF" TYPE', desc: 'Exterior Flood / Accent',        toolset: 'EXTERIOR', family: 'EF', isLinear: false, symInches: 10, isFixedSize: false },
  { id: 'EXT_EZ_STEP',    label: '"EZ" TYPE', desc: 'Exterior Step Light',             toolset: 'EXTERIOR', family: 'EZ', isLinear: false, symInches:  6, isFixedSize: false },
  { id: 'EXT_EW_WALL',    label: '"EW" TYPE', desc: 'Exterior Wall Sconce / Wall Pack',toolset: 'EXTERIOR', family: 'EW', isLinear: false, symInches: 10, isFixedSize: false },
  // ── CONTROLS (11) ──────────────────────────────────────────────────────────
  // OCC_CEIL and REMOTE_PS are physical devices with real-world sizes.
  // All wall-mounted controls are fixed-size (don't scale with drawing).
  { id: 'CTRL_REMOTE_PS',   label: 'REMOTE PS', desc: 'Remote Power Supply',           toolset: 'CONTROLS', family: 'PS',  isLinear: false, symInches:  6, isFixedSize: false },
  { id: 'CTRL_SW_SINGLE',   label: 'S',         desc: 'Single Pole Switch',            toolset: 'CONTROLS', family: 'S',   isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'CTRL_SW_3WAY',     label: 'S₃',        desc: '3-Way Switch',                  toolset: 'CONTROLS', family: 'S3',  isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'CTRL_SW_4WAY',     label: 'S₄',        desc: '4-Way Switch',                  toolset: 'CONTROLS', family: 'S4',  isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'CTRL_SW_ELV',      label: 'Sᴅ',        desc: 'ELV Dimming Switch',            toolset: 'CONTROLS', family: 'SD',  isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'CTRL_OCC_CEIL',    label: 'OCC',       desc: 'Ceiling Occ Sensor',            toolset: 'CONTROLS', family: 'OCC', isLinear: false, symInches:  9, isFixedSize: false },
  { id: 'CTRL_OCC_WALL',    label: 'S_OS',      desc: 'Wall Occ Sensor',               toolset: 'CONTROLS', family: 'OS',  isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'CTRL_TIMER',       label: 'S_T',       desc: 'Timer Switch',                  toolset: 'CONTROLS', family: 'ST',  isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'CTRL_010V',        label: 'Z',         desc: '0-10V Dimming Switch',          toolset: 'CONTROLS', family: 'Z',   isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'CTRL_KEYPAD',      label: 'S_K',       desc: 'Keypad',                        toolset: 'CONTROLS', family: 'SK',  isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'CTRL_KEYPAD_AMEN', label: 'K',         desc: 'Keypad (Amenities)',            toolset: 'CONTROLS', family: 'K',   isLinear: false, symInches: null, isFixedSize: true  },
  // ── TOOLS (13) ─────────────────────────────────────────────────────────────
  { id: 'TOOL_CLOUD',            label: 'CLOUD',   desc: 'Revision Cloud Markup',            toolset: 'TOOLS', family: null, isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'TOOL_CALLOUT',          label: 'CALLOUT', desc: 'Text Callout with Leader Arrow',   toolset: 'TOOLS', family: null, isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'TOOL_POLY_AREA',        label: 'AREA',    desc: 'Polygon Area Measurement',         toolset: 'TOOLS', family: null, isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'TOOL_CENTERLINE',      label: 'CL',    desc: 'Centerline Marker',             toolset: 'TOOLS', family: null, isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'TOOL_X',               label: 'X',     desc: 'X Mark',                        toolset: 'TOOLS', family: null, isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'TOOL_REMOVE',          label: 'DEMO',  desc: 'Remove / Demolish',             toolset: 'TOOLS', family: null, isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'TOOL_STAMP_DATE',      label: 'DATE',  desc: 'Date Stamp',                    toolset: 'TOOLS', family: null, isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'TOOL_ILC_LOGO',        label: 'LOGO',  desc: 'ILC Logo',                      toolset: 'TOOLS', family: null, isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'TOOL_SUBMITTAL_BLOCK', label: 'STAMP', desc: 'Submittal Block',               toolset: 'TOOLS', family: null, isLinear: false, symInches: null, isFixedSize: true  },
  { id: 'TOOL_DIM_1_5',         label: "1.5'",  desc: "1.5' Dimension Marker",         toolset: 'TOOLS', family: null, isLinear: false, symInches:  18, isFixedSize: false },
  { id: 'TOOL_DIM_2',           label: "2'",    desc: "2' Dimension Marker",           toolset: 'TOOLS', family: null, isLinear: false, symInches:  24, isFixedSize: false },
  { id: 'TOOL_DIM_2_5',         label: "2.5'",  desc: "2.5' Dimension Marker",         toolset: 'TOOLS', family: null, isLinear: false, symInches:  30, isFixedSize: false },
  { id: 'TOOL_DIM_3',           label: "3'",    desc: "3' Dimension Marker",           toolset: 'TOOLS', family: null, isLinear: false, symInches:  36, isFixedSize: false },
  { id: 'TOOL_DIM_4',           label: "4'",    desc: "4' Dimension Marker",           toolset: 'TOOLS', family: null, isLinear: false, symInches:  48, isFixedSize: false },
];

// ── Lookup maps ───────────────────────────────────────────────────────────────
export const SYMBOL_MAP = Object.fromEntries(SYMBOLS.map(s => [s.id, s]));

// ── Toolset definitions ───────────────────────────────────────────────────────
export const TOOLSETS = [
  { id: 'INTERIOR', label: 'Interior', shortLabel: 'INT' },
  { id: 'UNIT',     label: 'Unit',     shortLabel: 'UNIT' },
  { id: 'EXTERIOR', label: 'Exterior', shortLabel: 'EXT' },
  { id: 'CONTROLS', label: 'Controls', shortLabel: 'CTRL' },
  { id: 'TOOLS',    label: 'Tools',    shortLabel: 'TOOLS' },
];

export const TOOLSET_SYMBOLS = Object.fromEntries(
  TOOLSETS.map(ts => [ts.id, SYMBOLS.filter(s => s.toolset === ts.id)])
);
