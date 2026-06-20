// E2E stub za ESM-only balík `archiver` (v8, type:module).
// ts-jest (allowJs:false, module:nodenext) neumí transpilovat archiver/lib/*.js → ESM import
// padá na bootstrapu app.module (world-export.module). World-export se v e2e netestuje,
// stačí splnit import { ZipArchive } at se appka nabootuje. Žádný dopad na prod běh.
export class ZipArchive {}
export class TarArchive {}
export class JsonArchive {}
export class Archiver {}
export default {};
