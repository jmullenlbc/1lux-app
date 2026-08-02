import { readFile, appendFile, writeFile } from 'fs/promises';
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const OUT='C:/Users/MICHAE~1/AppData/Local/Temp/claude/G--My-Drive-BUDGETING-TOOL-SOFTWARE/5af538f4-1fb5-47d7-a4ac-508b9bbbbbfc/scratchpad/pagefinder_results.txt';
await writeFile(OUT,'');
const log=async(s:string)=>{console.log(s);await appendFile(OUT,s+'\n');};

const PR='G:/Shared drives/PROJECTS';
const FILES:[string,string][]=[
 ['Approach CD set',      `${PR}/CENTRAL PARK THE APPROACH/CLIENT DOCS/PDFS AND DOCS/26.07.06 CD PROGRESS SET/Document Submissions/2026.07.01_CPRTD CD Progress Set.pdf`],
 ['Broadstone DD set',    `${PR}/BROADSTONE SOUTHGLENN/ARCH/PDFS AND DOCS/26.06.23 DD/Bid-Documents/DD-ITB/Broadstone_Southglenn_-_DD_Drawing_Set_-_2026.06.12.pdf`],
 ['Stevie 90% set',       `${PR}/__PEER REVIEW/THE STEVIE/CLIENT DOCUMENTS/DRAWINGS/26.06.24 90 DD/Documents/02-Bid-Packages/Bid-Package-3---Bulletin-1-90%-Set/4---Plans-&-Narrative/2026_0618_-_Mariposa_-_90%_Bulletin_01_Combined.pdf`],
 ['WMC Civil',            `${PR}/__PEER REVIEW/WEST MIDDLE CREEK/CLIENT DOCUMENTS/DRAWINGS/24.12.03 PERMIT SET FOR GMP/West Middle Creek - Permit Set for GMP/01_2024.11.25_VAIL WMC_GMP NFC_Civil.pdf`],
 ['WMC Landscape',        `${PR}/__PEER REVIEW/WEST MIDDLE CREEK/CLIENT DOCUMENTS/DRAWINGS/24.12.03 PERMIT SET FOR GMP/West Middle Creek - Permit Set for GMP/02_2024.11.25_Vail WMC_GMP NFC_Landscape.pdf`],
 ['WMC Arch',             `${PR}/__PEER REVIEW/WEST MIDDLE CREEK/CLIENT DOCUMENTS/DRAWINGS/24.12.03 PERMIT SET FOR GMP/West Middle Creek - Permit Set for GMP/03_2024.11.25_Vail WMC_GMP NFC_Arch.pdf`],
 ['WMC Structural',       `${PR}/__PEER REVIEW/WEST MIDDLE CREEK/CLIENT DOCUMENTS/DRAWINGS/24.12.03 PERMIT SET FOR GMP/West Middle Creek - Permit Set for GMP/04_2024.11.25_Vail WMC_GMP NFC_Structural.pdf`],
 ['WMC Mech',             `${PR}/__PEER REVIEW/WEST MIDDLE CREEK/CLIENT DOCUMENTS/DRAWINGS/24.12.03 PERMIT SET FOR GMP/West Middle Creek - Permit Set for GMP/05_2024.11.25 Vail WMC_GMP NFC_Mech.pdf`],
 ['WMC Plumbing',         `${PR}/__PEER REVIEW/WEST MIDDLE CREEK/CLIENT DOCUMENTS/DRAWINGS/24.12.03 PERMIT SET FOR GMP/West Middle Creek - Permit Set for GMP/06_2024.11.25_Vail WMC_GMP NFC_Plumbing.pdf`],
 ['WMC Electrical',       `${PR}/__PEER REVIEW/WEST MIDDLE CREEK/CLIENT DOCUMENTS/DRAWINGS/24.12.03 PERMIT SET FOR GMP/West Middle Creek - Permit Set for GMP/Addendum 2 - Electrical Set/08_2024.11.25_ VAIL WMC_GMP_Electrical.pdf`],
 ['Summit Avon E set',    `${PR}/__PEER REVIEW/THE SUMMIT (AVON GRAND PEAKS)/CLIENT DOCUMENTS/DRAWINGS/26.04.26 Permit set/LIGHTIGN DRAWINGS TO USE/20260423_AvonLotB_Permit_E.pdf`],
 ['Zenith Bldg A E+ID',   `${PR}/__PEER REVIEW/ZENITH ON 25TH/CLIENT DOCUMENTS/DRAWINGS/26.04.29 Construction Set/LIGHTING DRAWINGS TO USE/BUILDING A E & ID SHEETS.pdf`],
 ['Zenith Bldg B E+ID',   `${PR}/__PEER REVIEW/ZENITH ON 25TH/CLIENT DOCUMENTS/DRAWINGS/26.04.29 Construction Set/LIGHTING DRAWINGS TO USE/BUILDING B E & ID SHEETS.pdf`],
 ['Zenith Bldg C',        `${PR}/__PEER REVIEW/ZENITH ON 25TH/CLIENT DOCUMENTS/DRAWINGS/26.04.29 Construction Set/LIGHTING DRAWINGS TO USE/BUILDING C E SHEETS.pdf`],
 ['Zenith Bldg D',        `${PR}/__PEER REVIEW/ZENITH ON 25TH/CLIENT DOCUMENTS/DRAWINGS/26.04.29 Construction Set/LIGHTING DRAWINGS TO USE/BUILDING D E SHEETS.pdf`],
 ['Zenith Bldg E',        `${PR}/__PEER REVIEW/ZENITH ON 25TH/CLIENT DOCUMENTS/DRAWINGS/26.04.29 Construction Set/LIGHTING DRAWINGS TO USE/BUILDING E E SHEETS.pdf`],
 ['Zenith Bldg F',        `${PR}/__PEER REVIEW/ZENITH ON 25TH/CLIENT DOCUMENTS/DRAWINGS/26.04.29 Construction Set/LIGHTING DRAWINGS TO USE/BUILDING F E SHEETS.pdf`],
 ['Zenith Bldg H',        `${PR}/__PEER REVIEW/ZENITH ON 25TH/CLIENT DOCUMENTS/DRAWINGS/26.04.29 Construction Set/LIGHTING DRAWINGS TO USE/BUILDING H E SHEETS.pdf`],
 ['Zenith Bldg J',        `${PR}/__PEER REVIEW/ZENITH ON 25TH/CLIENT DOCUMENTS/DRAWINGS/26.04.29 Construction Set/LIGHTING DRAWINGS TO USE/BUILDING J E SHEETS.pdf`],
 ['Zenith Bldg K',        `${PR}/__PEER REVIEW/ZENITH ON 25TH/CLIENT DOCUMENTS/DRAWINGS/26.04.29 Construction Set/LIGHTING DRAWINGS TO USE/BUILDING K E SHEETS.pdf`],
 ['Zenith Bldg P',        `${PR}/__PEER REVIEW/ZENITH ON 25TH/CLIENT DOCUMENTS/DRAWINGS/26.04.29 Construction Set/LIGHTING DRAWINGS TO USE/BUILDING P E SHEETS.pdf`],
 ['Zenith Bldg Q',        `${PR}/__PEER REVIEW/ZENITH ON 25TH/CLIENT DOCUMENTS/DRAWINGS/26.04.29 Construction Set/LIGHTING DRAWINGS TO USE/BUILDING Q  E SHEETS.pdf`],
];

type Hit={page:number,score:number,title:string};
const CATS:[string,RegExp,number][]=[
 ['SITE_PLAN',   /OVERALL SITE PLAN|SITE PLAN|SITE LIGHTING|PHOTOMETRIC/ ,0],
 ['CODE_EGRESS', /LIFE SAFETY|EGRESS|CODE PLAN/ ,0],
 ['LUM_SCHED',   /LUMINAIRE SCHEDULE|LIGHTING FIXTURE SCHEDULE|FIXTURE SCHEDULE/ ,0],
 ['UNIT_MIX',    /UNIT MIX|UNIT MATRIX|UNIT SCHEDULE/ ,0],
 ['DOOR_SCHED',  /DOOR SCHEDULE/ ,0],
];

const grand={pages:0,ms:0,textless:0};
for(const [name,path] of FILES){
  const t0=Date.now();
  let doc:any;
  try{ doc=await pdfjs.getDocument({data:new Uint8Array(await readFile(path))}).promise; }
  catch(e:any){ await log(`\n### ${name}: OPEN FAIL ${e.message.slice(0,80)}`); continue; }
  const N=doc.numPages;
  const best=new Map<string,Hit[]>(); let textless=0;
  for(let i=1;i<=N;i++){
    let txt='';
    try{ const tc=await doc.getPage(i).then((pg:any)=>pg.getTextContent()); txt=tc.items.map((x:any)=>x.str).join(' '); }catch{}
    if(txt.trim().length<20){textless++;continue;}
    const T=txt.toUpperCase();
    for(const [cat,re] of CATS){
      if(!re.test(T))continue;
      let score=(T.match(re)||[]).length*10;
      if(cat==='SITE_PLAN'&&/PARKING|STALL|LOT/.test(T))score+=15;
      if(cat==='SITE_PLAN'&&/ENLARGE|DETAIL|SECTION/.test(T))score-=8;
      if(cat==='LUM_SCHED'&&/\bQTY\b|MANUFACTURER/.test(T))score+=15;
      const title=(T.match(/(OVERALL [A-Z ]{4,40}|SITE [A-Z ]{4,40}|LEVEL \d[A-Z \-]{0,30}|[A-Z ]{4,30}SCHEDULE)/)?.[0]??'').slice(0,45);
      const arr=best.get(cat)??[];arr.push({page:i,score,title});
      arr.sort((a,b)=>b.score-a.score);best.set(cat,arr.slice(0,3));
    }
  }
  const ms=Date.now()-t0;
  grand.pages+=N;grand.ms+=ms;grand.textless+=textless;
  await log(`\n### ${name} — ${N} pages, ${(ms/1000).toFixed(0)}s, ${textless} textless`);
  for(const [cat] of CATS){
    const arr=best.get(cat);
    if(arr) await log(`  ${cat.padEnd(12)} ${arr.map(h=>`p${h.page}(${h.score}${h.title?' '+h.title.trim():''})`).join(' | ')}`);
  }
  try{doc.destroy();}catch{}
}
await log(`\n=== GRAND TOTAL: ${grand.pages} pages scanned in ${(grand.ms/60000).toFixed(1)} min | ${grand.textless} textless pages (vision-fallback candidates) ===`);
