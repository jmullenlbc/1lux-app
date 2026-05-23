// ── ILC Spec Library seed ─────────────────────────────────────────────────────
// Source: Standard_products_matrix_final.xlsx (Standards tab) — 69 records
// budget_cost: null on all — to be filled via admin UI
// Variables stored as JSON array: [{position, resolve_at, options, default}]
// base_catalog: everything before the first *** position

// Helper: build a variable JSON string
function vars(...positions) {
  return JSON.stringify(positions.map(p => ({
    position:   p.position,
    resolve_at: p.resolve_at || 'CLIENT',
    options:    p.options    || [],
    default:    p.default    || null,
  })));
}

const CCT_VAR    = { position: 'CCT',         resolve_at: 'CLIENT', options: ['2700','3000','3500','4000'], default: '3000' };
const FINISH_VAR = { position: 'FINISH',       resolve_at: 'CLIENT', options: [], default: null };
const WATT_VAR   = { position: 'WATTAGE',      resolve_at: 'PROJECT', options: [], default: null };
const BLADE_VAR  = { position: 'BLADE_FINISH', resolve_at: 'CLIENT', options: [], default: null };
const HEIGHT_VAR = { position: 'HEIGHT',       resolve_at: 'PROJECT', options: [], default: null };
const GAUGE_VAR  = { position: 'GAUGE',        resolve_at: 'PROJECT', options: [], default: null };
const VOLT_VAR   = { position: 'VOLTAGE',      resolve_at: 'PROJECT', options: ['120','277','347'], default: '120' };
const DIST_VAR   = { position: 'DISTRIBUTION', resolve_at: 'PROJECT', options: ['II','III','IV','V'], default: 'III' };

// Stable seed IDs so every deploy is idempotent
const ILC_SPECS = [
  // ── A  LINEAR PENDANT ────────────────────────────────────────────────────────
  { id:'spec-A-HP2',  master_type_id:'A', family:'LINEAR PENDANT',            description:'ARCH. LINEAR PENDANT (LOW COST)',                manufacturer:'FINELITE',    base_catalog:'HP-2',         full_catalog:'HP-2',                                  is_default:true  },
  { id:'spec-A-HP4',  master_type_id:'A', family:'LINEAR PENDANT',            description:'ARCH. LINEAR PENDANT (LOW COST)',                manufacturer:'FINELITE',    base_catalog:'HP-4',         full_catalog:'HP-4'                                                    },

  // ── B  TROFFER ───────────────────────────────────────────────────────────────
  { id:'spec-B-FP',   master_type_id:'B', family:'TROFFER',                   description:'FLAT PANEL TROFFER',                            manufacturer:'ELUMA',       base_catalog:'FP',           variables:vars(WATT_VAR),                             is_default:true  },
  { id:'spec-B-RTR',  master_type_id:'B', family:'TROFFER',                   description:'BASKET TROFFER',                                manufacturer:'ELUMA',       base_catalog:'RTR',          variables:vars(WATT_VAR)                                               },
  { id:'spec-B-HPR',  master_type_id:'B', family:'TROFFER',                   description:'UPGRADED TROFFER',                              manufacturer:'FINELITE',    base_catalog:'HPR',          full_catalog:'HPR',                tier:'UPGRADE'                     },

  // ── C  CEILING SURFACE ───────────────────────────────────────────────────────
  { id:'spec-C-DLR7', master_type_id:'C', family:'CEILING SURFACE',           description:'6IN BACK-LIT SURFACE MOUNT LED DISK',           manufacturer:'ELUMA',       base_catalog:'DL-R-7',       full_catalog:'DL-R-7-3000',        is_default:false,variables:vars({...CCT_VAR}) },
  { id:'spec-C-DL5',  master_type_id:'C', family:'CEILING SURFACE',           description:'5 INCH EDGE-LIT SURFACE MOUNT DISK',            manufacturer:'ELUMA',       base_catalog:'DL-5',         full_catalog:'DL-5-3000',          variables:vars({...CCT_VAR})                     },
  { id:'spec-C-DL7',  master_type_id:'C', family:'CEILING SURFACE',           description:'7 INCH EDGE-LIT SURFACE MOUNT DISK',            manufacturer:'ELUMA',       base_catalog:'DL-7',         full_catalog:'DL-7-3000',          is_default:true, variables:vars({...CCT_VAR}) },
  { id:'spec-C-DL12', master_type_id:'C', family:'CEILING SURFACE',           description:'12 INCH EDGE-LIT SURFACE MOUNT DISK',           manufacturer:'ELUMA',       base_catalog:'DL-12',        full_catalog:'DL-12-3000',         variables:vars({...CCT_VAR})                     },

  // ── D  RECESSED DOWNLIGHT ────────────────────────────────────────────────────
  { id:'spec-D-IOL-LC',master_type_id:'D',family:'RECESSED DOWNLIGHT',        description:'CANLESS DOWNLIGHT',                             manufacturer:'NORA',        base_catalog:'IOLITE',       full_catalog:'IOLITE',             is_default:true, tier:'LOW_COST'                  },
  { id:'spec-D-IOL-ST',master_type_id:'D',family:'RECESSED DOWNLIGHT',        description:'STANDARD DOWNLIGHT',                            manufacturer:'NORA',        base_catalog:'IOLITE',       full_catalog:'IOLITE',             tier:'STANDARD'                                    },
  { id:'spec-D-IOL-HO',master_type_id:'D',family:'RECESSED DOWNLIGHT',        description:'HIGH OUTPUT DOWNLIGHT',                         manufacturer:'NORA',        base_catalog:'IOLITE',       full_catalog:'IOLITE',             tier:'UPGRADE'                                     },
  { id:'spec-D-LLP4',  master_type_id:'D',family:'RECESSED DOWNLIGHT',        description:'SHALLOW 2IN HOUSING RECESSED DOWNLIGHT',        manufacturer:'ACUITY',      base_catalog:'LLP4',         full_catalog:'LLP4'                                                    },

  // ── EB  EXTERIOR BOLLARD ─────────────────────────────────────────────────────
  { id:'spec-EB-BOL',  master_type_id:'EB',family:'EXTERIOR BOLLARD',         description:'LANDSCAPE (12-18IN) LEVEL BOLLARD',             manufacturer:'WESTGATE',    base_catalog:'BOL-700',      full_catalog:'BOL-700',            is_default:true                                    },
  { id:'spec-EB-TBL',  master_type_id:'EB',family:'EXTERIOR BOLLARD',         description:'LANDSCAPE (12-18IN) LEVEL BOLLARD',             manufacturer:'NLS',         base_catalog:'TBL',          full_catalog:'TBL'                                                     },
  { id:'spec-EB-ATL',  master_type_id:'EB',family:'EXTERIOR BOLLARD',         description:'LANDSCAPE (12-18IN) LEVEL BOLLARD',             manufacturer:'HINKLEY',     base_catalog:'ATLANTIS SMALL',full_catalog:'ATLANTIS SMALL',    tier:'UPGRADE'                                     },
  { id:'spec-EB-SPR',  master_type_id:'EB',family:'EXTERIOR BOLLARD',         description:'LANDSCAPE (12-18IN) LEVEL BOLLARD',             manufacturer:'HINKLEY',     base_catalog:'SPRIGNFIELD SMALL',full_catalog:'SPRIGNFIELD SMALL',tier:'UPGRADE'                                  },

  // ── ED  EXTERIOR RECESSED DOWNLIGHT ──────────────────────────────────────────
  { id:'spec-ED-IOL',  master_type_id:'ED',family:'EXTERIOR RECESSED DOWNLIGHT',description:'RESI (LOW COST) DOWNLIGHT',                  manufacturer:'NORA',        base_catalog:'IOLITE',       full_catalog:'IOLITE',             is_default:true, tier:'LOW_COST'                  },

  // ── EF  EXTERIOR FLOOD ───────────────────────────────────────────────────────
  { id:'spec-EF-HNK',  master_type_id:'EF',family:'EXTERIOR FLOOD',           description:'STANDARD EXTERIOR LANDSCAPE FLOOD',             manufacturer:'HINKLEY',     base_catalog:'ACCENT SPOT & FLOOD',full_catalog:'ACCENT SPOT & FLOOD',is_default:true                       },
  { id:'spec-EF-SPJ',  master_type_id:'EF',family:'EXTERIOR FLOOD',           description:'EXTERIOR LANDSCAPE FLOOD, STANDARD',            manufacturer:'SPJ',         base_catalog:'MR. UNIVERSE', full_catalog:'MR. UNIVERSE'                                               },

  // ── EH  EXTERIOR HANDRAIL ────────────────────────────────────────────────────
  { id:'spec-EH-KLIK', master_type_id:'EH',family:'EXTERIOR HANDRAIL',        description:'EXTERIOR HANDRAIL - PODS',                      manufacturer:'KLIK',        base_catalog:'LEDPOD',       full_catalog:'LEDPOD',             is_default:true                                    },

  // ── EL  EXTERIOR LINEAR (CATENARY) ───────────────────────────────────────────
  { id:'spec-EL-DECO', master_type_id:'EL',family:'EXTERIOR LINEAR',          description:'CATENARY / STRING LIGHTING',                    manufacturer:'PRIMUS',      base_catalog:'DECOSTRING',   full_catalog:'DECOSTRING',         is_default:true                                    },

  // ── EP  EXTERIOR POLE ────────────────────────────────────────────────────────
  { id:'spec-EP-AL',   master_type_id:'EP',family:'EXTERIOR POLE',            description:'STANDARD AREA LIGHT',                          manufacturer:'ELUMA',       base_catalog:'AL',           variables:vars(WATT_VAR,VOLT_VAR,FINISH_VAR,DIST_VAR),is_default:true             },
  { id:'spec-EP-TRC',  master_type_id:'EP',family:'EXTERIOR POLE',            description:'EXTERIOR AMENITY AREA LIGHT',                   manufacturer:'NLS',         base_catalog:'TRC',          full_catalog:'TRC',                tier:'UPGRADE'                                     },
  { id:'spec-EP-RSS',  master_type_id:'EP',family:'EXTERIOR POLE',            description:'STEEL ROUND POLE',                              manufacturer:'HAPCO',       base_catalog:'RSS',          variables:vars(HEIGHT_VAR,GAUGE_VAR)                                          },

  // ── ER  EXTERIOR RECESSED LINEAR ────────────────────────────────────────────
  { id:'spec-ER-HP4',  master_type_id:'ER',family:'EXTERIOR RECESSED LINEAR', description:'STANDARD ARCHITECTURAL RECESSED LINEAR',        manufacturer:'FINELITE',    base_catalog:'HP4',          full_catalog:'HP4',                is_default:true                                    },

  // ── ES  EXTERIOR SURFACE STRIP ───────────────────────────────────────────────
  { id:'spec-ES-VPA',  master_type_id:'ES',family:'EXTERIOR SURFACE STRIP',   description:'VAPORTIGHT',                                    manufacturer:'BARRON',      base_catalog:'VPA-4-40-C',   variables:vars(FINISH_VAR),        is_default:true                                    },

  // ── EW  EXTERIOR WALL (wall packs + area lights) ─────────────────────────────
  { id:'spec-EW-PFND', master_type_id:'EW',family:'EXTERIOR WALL',            description:'LOW COST LOW PROFILE WALL PACK',                manufacturer:'MAXIM',       base_catalog:'PATHFINDER',   full_catalog:'PATHFINDER',         tier:'LOW_COST'                                    },
  { id:'spec-EW-WDG',  master_type_id:'EW',family:'EXTERIOR WALL',            description:'OPTICAL CONTROL LOW PROFILE WALL PACK',         manufacturer:'ACUITY',      base_catalog:'WEDGE',        full_catalog:'WEDGE',              is_default:true                                    },
  { id:'spec-EW-AL',   master_type_id:'EW',family:'EXTERIOR WALL',            description:'WALL MOUNTED AREA LIGHT',                       manufacturer:'ELUMA',       base_catalog:'AL',           variables:vars(WATT_VAR,VOLT_VAR,FINISH_VAR,DIST_VAR),tier:'UPGRADE'            },
  // EW / WALL MOUNT context: unit balcony sconces
  { id:'spec-EW-CYWS', master_type_id:'EW',family:'WALL MOUNT',               description:'UNIT BALCONY SCONCE',                           manufacturer:'ELUMA',       base_catalog:'CYWS-30',      variables:vars(FINISH_VAR),        use_context:'["UNIT_BALCONY"]'                     },
  { id:'spec-EW-EXBLS',master_type_id:'EW',family:'WALL MOUNT',               description:'UNIT BALCONY SCONCE',                           manufacturer:'ELUMA',       base_catalog:'EXBLS',        variables:vars(FINISH_VAR,WATT_VAR),use_context:'["UNIT_BALCONY"]'                    },

  // ── EZ  EXTERIOR STEPLIGHT ───────────────────────────────────────────────────
  { id:'spec-EZ-3003', master_type_id:'EZ',family:'EXTERIOR STEPLIGHT',       description:'STANDARD HORIZONTAL STEPLIGHT',                 manufacturer:'KUZCO',       base_catalog:'ER3003',       variables:vars(FINISH_VAR),        is_default:true, full_catalog:null              },
  { id:'spec-EZ-3005', master_type_id:'EZ',family:'EXTERIOR STEPLIGHT',       description:'STANDARD VERTICAL STEPLIGHT',                   manufacturer:'KUZCO',       base_catalog:'ER3005',       variables:vars(FINISH_VAR)                                                    },
  { id:'spec-EZ-SPJ',  master_type_id:'EZ',family:'EXTERIOR STEPLIGHT',       description:'LOW COST STEPLIGHT',                            manufacturer:'SPJ',         base_catalog:'SPJ-MSL4-LD-PVDBZ',full_catalog:'SPJ-MSL4-LD-PVDBZ',design_notes:'CHANGE TO 0-10V IF NEEDED'},
  { id:'spec-EZ-ARCH', master_type_id:'EZ',family:'EXTERIOR STEPLIGHT',       description:'ARCHITECTURAL OPTICAL CONTROL STEPLIGHT',       manufacturer:'',            base_catalog:'',                                                 is_active:false                                    },

  // ── F  FAN ───────────────────────────────────────────────────────────────────
  { id:'spec-F-CFD',   master_type_id:'F', family:'FAN',                      description:'FAN WITH LIGHT KIT (LOW COST)',                  manufacturer:'ELUMA',       base_catalog:'CFD-52-3000',  variables:vars(FINISH_VAR),        tier:'LOW_COST'                                    },
  { id:'spec-F-CF02',  master_type_id:'F', family:'FAN',                      description:'FAN WITH LIGHT KIT (LOW COST)',                  manufacturer:'ELUMA',       base_catalog:'CF02-52-3000', variables:vars(FINISH_VAR),        tier:'LOW_COST'                                    },
  { id:'spec-F-CF',    master_type_id:'F', family:'FAN',                      description:'STANDARD FAN WITH LIGHT KIT',                   manufacturer:'ELUMA',       base_catalog:'CF-52-3000',   variables:vars(FINISH_VAR,BLADE_VAR),is_default:true                                  },

  // ── G  LOW BAY / GARAGE ──────────────────────────────────────────────────────
  { id:'spec-G-52L',   master_type_id:'G', family:'LOW BAY / GARAGE',         description:'BASIC GARAGE FIXTURE (STANDARD OUTPUT)',        manufacturer:'ELUMA',       base_catalog:'GL-R-52L-3500',full_catalog:'GL-R-52L-3500',     is_default:true                                    },
  { id:'spec-G-78L',   master_type_id:'G', family:'LOW BAY / GARAGE',         description:'BASIC GARAGE FIXTURE (HIGH OUTPUT)',             manufacturer:'ELUMA',       base_catalog:'GL-R-78L-3500',full_catalog:'GL-R-78L-3500'                                                  },

  // ── H  HIGH BAY ──────────────────────────────────────────────────────────────
  { id:'spec-H-RHB',   master_type_id:'H', family:'HIGH BAY',                 description:'ROUND HIGH-BAY, IP65',                          manufacturer:'ELUMA',       base_catalog:'RHB',          variables:vars(WATT_VAR,{...CCT_VAR}),is_default:true                            },
  { id:'spec-H-LHB',   master_type_id:'H', family:'HIGH BAY',                 description:'LINEAR HIGH-BAY, IP20',                         manufacturer:'ELUMA',       base_catalog:'LHB',          variables:vars(WATT_VAR,{...CCT_VAR})                                         },

  // ── L  LINEAR TAPE WITH CHANNEL ──────────────────────────────────────────────
  { id:'spec-L-GM',    master_type_id:'L', family:'LINEAR TAPE WITH CHANNEL',  description:'LOW VOLTAGE LED TAPE AND CHANNEL',              manufacturer:'GM LIGHTING', base_catalog:'24v LED TAPE', full_catalog:'24v LED TAPE',      is_default:true                                    },
  { id:'spec-L-LUM',   master_type_id:'L', family:'LINEAR TAPE WITH CHANNEL',  description:'LOW VOLTAGE LED TAPE AND CHANNEL',              manufacturer:'LUMINII',     base_catalog:'24v LED TAPE', full_catalog:'24v LED TAPE'                                                   },

  // ── M  RECESSED MULTIPLE ─────────────────────────────────────────────────────
  { id:'spec-M-MRM',   master_type_id:'M', family:'RECESSED MULTIPLE',         description:'RECESSED MULTIPLE',                             manufacturer:'LUMENTURE',   base_catalog:'MINI RECESSED MULT',full_catalog:'MINI RECESSED MULT',is_default:true                       },

  // ── N  CYLINDER ──────────────────────────────────────────────────────────────
  { id:'spec-N-ILENE', master_type_id:'N', family:'CYLINDER',                  description:'STANDARD CYLINDER',                             manufacturer:'NORA',        base_catalog:'ILENE MINI CYLINDERS',full_catalog:'ILENE MINI CYLINDERS',is_default:true                 },

  // ── R  RECESSED LINEAR ───────────────────────────────────────────────────────
  { id:'spec-R-HP',    master_type_id:'R', family:'RECESSED LINEAR',           description:'ARCH. LINEAR RECESSED (LOW COST)',              manufacturer:'FINELITE',    base_catalog:'HP-2 HP-4',    full_catalog:'HP-2 HP-4',         is_default:true                                    },

  // ── S  SURFACE LINEAR ────────────────────────────────────────────────────────
  { id:'spec-S-STR',   master_type_id:'S', family:'SURFACE LINEAR',            description:'STANDARD LED STRIP',                            manufacturer:'ELUMA',       base_catalog:'STR-48-40L-3500',full_catalog:'STR-48-40L-3500',  is_default:true                                    },
  { id:'spec-S-STRBB', master_type_id:'S', family:'SURFACE LINEAR',            description:'STANDARD LED STRIP W/BATTERY BACKUP',           manufacturer:'ELUMA',       base_catalog:'STR-48-40L-3500-BB',full_catalog:'STR-48-40L-3500-BB',design_notes:'LIFE SAFETY ROOMS'  },

  // ── T  TRACK SYSTEM ──────────────────────────────────────────────────────────
  { id:'spec-T-NT3',   master_type_id:'T', family:'TRACK SYSTEM',              description:'STANDARD 1 CIRCUIT TRACK',                      manufacturer:'NORA',        base_catalog:'NT-3',         variables:vars({position:'LENGTH',resolve_at:'PROJECT',options:[],default:null}),is_default:true,design_notes:'INCLUDE ACCESSORIES' },
  { id:'spec-T-864',   master_type_id:'T', family:'TRACK SYSTEM',              description:'STANDARD TRACK HEAD, LOW OUTPUT',               manufacturer:'NORA',        base_catalog:'NTE-864',      full_catalog:'NTE-864'                                                        },
  { id:'spec-T-875',   master_type_id:'T', family:'TRACK SYSTEM',              description:'STANDARD TRACK HEAD, HIGHER OUTPUT',            manufacturer:'NORA',        base_catalog:'NTE-875',      full_catalog:'NTE-875'                                                        },
  { id:'spec-T-855',   master_type_id:'T', family:'TRACK SYSTEM',              description:'STANDARD TRACK HEAD, HIGHER OUTPUT',            manufacturer:'NORA',        base_catalog:'NTE-855',      full_catalog:'NTE-855'                                                        },

  // ── UC  LINE VOLTAGE UNDERCABINET ────────────────────────────────────────────
  { id:'spec-UC-12',   master_type_id:'UC',family:'LINE VOLTAGE UNDERCABINET', description:'1FT UNDERCABINET LIGHT WITH ON/OFF SWITCH',     manufacturer:'ELUMA',       base_catalog:'UC-12-3000',   full_catalog:'UC-12-3000',        is_default:true                                    },
  { id:'spec-UC-24',   master_type_id:'UC',family:'LINE VOLTAGE UNDERCABINET', description:'2FT UNDERCABINET LIGHT WITH ON/OFF SWITCH',     manufacturer:'ELUMA',       base_catalog:'UC-24-3000',   full_catalog:'UC-24-3000'                                                     },

  // ── V  VANITY ────────────────────────────────────────────────────────────────
  { id:'spec-V-RD2',   master_type_id:'V', family:'VANITY',                    description:'DOUBLE ROUND',                                  manufacturer:'ELUMA',       base_catalog:'VL-RD2-24-3000',variables:vars(FINISH_VAR)                                                   },
  { id:'spec-V-SQ',    master_type_id:'V', family:'VANITY',                    description:'SQUARE',                                        manufacturer:'ELUMA',       base_catalog:'VL-SQ-24-3000', variables:vars(FINISH_VAR)                                                   },
  { id:'spec-V-RD',    master_type_id:'V', family:'VANITY',                    description:'ROUND',                                         manufacturer:'ELUMA',       base_catalog:'VL-RD-24-3000', variables:vars(FINISH_VAR),       is_default:true                            },
  { id:'spec-V-LM',    master_type_id:'V', family:'VANITY',                    description:'STANDARD LIT MIRROR',                           manufacturer:'ELUMA',       base_catalog:'LM',            variables:vars(FINISH_VAR,{position:'SIZE',resolve_at:'PROJECT',options:[],default:null},{position:'VOLTAGE',resolve_at:'PROJECT',options:[],default:null}), design_notes:'ADDER TYPE' },

  // ── W  WALL MOUNT ────────────────────────────────────────────────────────────
  { id:'spec-W-STR',   master_type_id:'W', family:'WALL MOUNT',                description:'STAIRWELL',                                     manufacturer:'ELUMA',       base_catalog:'STR-48-56L-3500-MS-BB',full_catalog:'STR-48-56L-3500-MS-BB',is_default:true,use_context:'["STAIRWELL"]' },

  // ── X  EMERGENCY ─────────────────────────────────────────────────────────────
  { id:'spec-X-FE25',  master_type_id:'X', family:'EMERGENCY',                 description:'LED EMERGENCY FROGEYES',                        manufacturer:'ELUMA',       base_catalog:'EM-FE-25',     full_catalog:'EM-FE-25',          is_default:true                                    },
  { id:'spec-X-EXTH',  master_type_id:'X', family:'EMERGENCY',                 description:'THERMOPLASTIC EXIT SIGN',                       manufacturer:'ELUMA',       base_catalog:'EX-TH',        full_catalog:'EX-TH'                                                          },
  { id:'spec-X-EXUEL', master_type_id:'X', family:'EMERGENCY',                 description:'EDGE LIT EXIT SIGN',                            manufacturer:'ELUMA',       base_catalog:'EXU-EL-RG',    full_catalog:'EXU-EL-RG'                                                     },
  { id:'spec-X-NXFX',  master_type_id:'X', family:'EMERGENCY',                 description:'EXTERIOR NEMA 4X EXIT SIGN',                    manufacturer:'BARRON',      base_catalog:'NXFX',         full_catalog:'NXFX',              use_context:'["EXTERIOR"]'                         },

  // ── Z  STEPLIGHT ─────────────────────────────────────────────────────────────
  { id:'spec-Z-3003',  master_type_id:'Z', family:'STEPLIGHT',                 description:'STANDARD HORIZONTAL STEPLIGHT',                 manufacturer:'KUZCO',       base_catalog:'ER3003',        variables:vars(FINISH_VAR),       is_default:true                                   },
  { id:'spec-Z-3005',  master_type_id:'Z', family:'STEPLIGHT',                 description:'STANDARD VERTICAL STEPLIGHT',                   manufacturer:'KUZCO',       base_catalog:'ER3005',        variables:vars(FINISH_VAR)                                                   },
  { id:'spec-Z-ARCH',  master_type_id:'Z', family:'STEPLIGHT',                 description:'ARCHITECTURAL OPTICAL CONTROL STEPLIGHT',       manufacturer:'',            base_catalog:'',                                                 is_active:false                                    },

  // ── PS  POWER SUPPLY ─────────────────────────────────────────────────────────
  { id:'spec-PS-UNV',  master_type_id:'PS',family:'POWER SUPPLY',              description:'24V REMOTE DRIVER',                             manufacturer:'ELUMA',       base_catalog:'PS-UNV-96-24', full_catalog:'PS-UNV-96-24',      is_default:true                                    },
].map(s => ({
  // Apply defaults for optional fields
  variables:    s.variables    ?? null,
  full_catalog: s.full_catalog ?? null,
  budget_cost:  null,
  design_notes: s.design_notes ?? null,
  use_context:  s.use_context  ?? '[]',
  is_default:   s.is_default   ?? false,
  tier:         s.tier         ?? 'STANDARD',
  is_active:    s.is_active    ?? true,
  ...s,
}));

async function seedILCSpecs(prisma) {
  let count = 0;
  for (const spec of ILC_SPECS) {
    const { id, ...data } = spec;
    await prisma.iLCSpec.upsert({
      where:  { id },
      update: { description: data.description, manufacturer: data.manufacturer, base_catalog: data.base_catalog,
                full_catalog: data.full_catalog, variables: data.variables, design_notes: data.design_notes,
                use_context: data.use_context, is_default: data.is_default, tier: data.tier, is_active: data.is_active },
      create: { id, ...data },
    });
    count++;
  }
  console.log(`✓ ILCSpecs ready (${count})`);
}

module.exports = { seedILCSpecs, ILC_SPECS };
