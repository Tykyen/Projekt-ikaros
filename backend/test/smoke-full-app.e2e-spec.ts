import { createTestApp, TestApp } from './helpers/app-factory';

describe('Smoke: full AppModule bootstrap', () => {
  let testApp: TestApp | undefined;

  // close v afterAll (ne na konci `it`) → DB/app se zavře i když expect selže
  // nebo createTestApp hodí; jinak leakly handle a jest by bez --forceExit
  // visel jako zombie proces.
  afterAll(async () => {
    await testApp?.close();
  });

  it('boots full AppModule (žádný modules override)', async () => {
    testApp = await createTestApp();
    expect(testApp.app).toBeDefined();
    expect(testApp.connection).toBeDefined();
  }, 60_000);
});
