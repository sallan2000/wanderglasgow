export class StartingAreaError extends Error {}
export async function loadPublicStartingAreas() {
  return { areas: [
    { id: 'centre', name: 'City centre', lat: 55.8609, lon: -4.2514, updatedAt: 'fixture' },
    { id: 'west', name: 'West End', lat: 55.8745, lon: -4.2916, updatedAt: 'fixture' },
    { id: 'east', name: 'East End', lat: 55.8545, lon: -4.2372, updatedAt: 'fixture' },
  ] };
}