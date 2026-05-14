import { createTestApp, TestApp } from './helpers/app-factory';

describe('Smoke: full AppModule bootstrap', () => {
  let testApp: TestApp;

  it('boots full AppModule (žádný modules override)', async () => {
    testApp = await createTestApp();
    expect(testApp.app).toBeDefined();
    expect(testApp.connection).toBeDefined();
    await testApp.close();
  }, 60_000);
});
