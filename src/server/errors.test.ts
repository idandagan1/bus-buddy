import { failureResponse } from './errors';

describe('failureResponse', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('names the upstream that failed', async () => {
    expect(await failureResponse(new Error('coachusa /journey → 503')).json()).toEqual({ error: 'coachusa /journey → 503', source: 'coachusa' });
    expect((await failureResponse(new Error('njtransit index.json → 404')).json()).source).toBe('njtransit');
  });

  it('blames our own server for anything else', async () => {
    const res = failureResponse(new TypeError("Cannot read properties of null (reading 'time')"));
    expect(res.status).toBe(502);
    expect((await res.json()).source).toBe('server');
  });
});
