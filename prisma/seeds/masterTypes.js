// ── Master Types seed ─────────────────────────────────────────────────────────
// Source: Trackvia ILC_-_Master_Types_2026-05-21.csv (37 canonical records)
// is_unit_type: true for types that appear in the unit drawing palette
// ER is not in the Trackvia export but exists in ILCSpec data — added here.

const UNIT_TYPE_CODES = new Set(['C','D','F','G','L','P','S','UC','V','W','X','Z']);

const MASTER_TYPES = [
  { code: 'A',   description: 'FIXTURE', fixture_family: 'LINEAR PENDANT'             },
  { code: 'ACC', description: 'FIXTURE', fixture_family: 'ACCESSORY'                  },
  { code: 'B',   description: 'FIXTURE', fixture_family: 'TROFFER'                    },
  { code: 'C',   description: 'FIXTURE', fixture_family: 'CEILING SURFACE'            },
  { code: 'D',   description: 'FIXTURE', fixture_family: 'RECESSED DOWNLIGHT'         },
  { code: 'EB',  description: 'FIXTURE', fixture_family: 'EXTERIOR BOLLARD'           },
  { code: 'EC',  description: 'FIXTURE', fixture_family: 'EXTERIOR CEILING SURFACE'   },
  { code: 'ED',  description: 'FIXTURE', fixture_family: 'EXTERIOR RECESSED DOWNLIGHT'},
  { code: 'EF',  description: 'FIXTURE', fixture_family: 'EXTERIOR FLOOD'             },
  { code: 'EH',  description: 'FIXTURE', fixture_family: 'EXTERIOR HANDRAIL'          },
  { code: 'EL',  description: 'FIXTURE', fixture_family: 'EXTERIOR LINEAR'            },
  { code: 'EN',  description: 'FIXTURE', fixture_family: 'EXTERIOR SUSPENDED CYLINDER'},
  { code: 'EP',  description: 'FIXTURE', fixture_family: 'EXTERIOR POLE'              },
  { code: 'ER',  description: 'FIXTURE', fixture_family: 'EXTERIOR RECESSED LINEAR'   }, // in ILCSpec data, not in Trackvia export
  { code: 'ES',  description: 'FIXTURE', fixture_family: 'EXTERIOR SURFACE STRIP'     },
  { code: 'EU',  description: 'FIXTURE', fixture_family: 'EXTERIOR INGRADE'           },
  { code: 'EW',  description: 'FIXTURE', fixture_family: 'EXTERIOR WALL'              },
  { code: 'EZ',  description: 'FIXTURE', fixture_family: 'EXTERIOR STEPLIGHT'         },
  { code: 'F',   description: 'FIXTURE', fixture_family: 'FAN'                        },
  { code: 'G',   description: 'FIXTURE', fixture_family: 'LOW BAY / GARAGE'           },
  { code: 'H',   description: 'FIXTURE', fixture_family: 'HIGH BAY'                   },
  { code: 'K',   description: 'FIXTURE', fixture_family: 'SURFACE PUCK'               },
  { code: 'L',   description: 'FIXTURE', fixture_family: 'LINEAR TAPE WITH CHANNEL'   },
  { code: 'M',   description: 'FIXTURE', fixture_family: 'RECESSED MULTIPLE'          },
  { code: 'N',   description: 'FIXTURE', fixture_family: 'CYLINDER'                   },
  { code: 'P',   description: 'FIXTURE', fixture_family: 'PENDANT'                    },
  { code: 'PS',  description: 'FIXTURE', fixture_family: 'POWER SUPPLY'               },
  { code: 'R',   description: 'FIXTURE', fixture_family: 'RECESSED LINEAR'            },
  { code: 'S',   description: 'FIXTURE', fixture_family: 'SURFACE LINEAR'             },
  { code: 'T',   description: 'FIXTURE', fixture_family: 'TRACK SYSTEM'               },
  { code: 'U',   description: 'FIXTURE', fixture_family: 'INGRADE'                    },
  { code: 'UC',  description: 'FIXTURE', fixture_family: 'LINE VOLTAGE UNDERCABINET'  },
  { code: 'V',   description: 'FIXTURE', fixture_family: 'VANITY'                     },
  { code: 'W',   description: 'FIXTURE', fixture_family: 'WALL MOUNT'                 },
  { code: 'X',   description: 'FIXTURE', fixture_family: 'EMERGENCY'                  },
  { code: 'Y',   description: 'FIXTURE', fixture_family: 'BUDGET PLACEHOLDER'         },
  { code: 'Z',   description: 'FIXTURE', fixture_family: 'STEPLIGHT'                  },
].map(t => ({ ...t, is_unit_type: UNIT_TYPE_CODES.has(t.code), is_active: true, symbol_svg: '' }));

async function seedMasterTypes(prisma) {
  let count = 0;
  for (const mt of MASTER_TYPES) {
    await prisma.masterType.upsert({
      where:  { code: mt.code },
      update: { description: mt.description, fixture_family: mt.fixture_family, is_unit_type: mt.is_unit_type },
      create: mt,
    });
    count++;
  }
  console.log(`✓ MasterTypes ready (${count})`);
}

module.exports = { seedMasterTypes, MASTER_TYPES };
