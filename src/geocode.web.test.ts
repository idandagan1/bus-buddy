import { geocode as geocodeWeb } from './geocode.web';

describe('geocode (web)', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('asks the server with the query encoded', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ latitude: 40.9, longitude: -73.9 }) });
    await expect(geocodeWeb('Main St & 5th, Tenafly')).resolves.toEqual({ latitude: 40.9, longitude: -73.9 });
    expect(fetchMock).toHaveBeenCalledWith('/api/geocode?q=Main+St+%26+5th%2C+Tenafly');
  });

  it('is null on a server error, a network failure, or a bad body', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ latitude: 1, longitude: 2 }) });
    await expect(geocodeWeb('x')).resolves.toBeNull();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(geocodeWeb('x')).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('not json'); } });
    await expect(geocodeWeb('x')).resolves.toBeNull();
  });
});
