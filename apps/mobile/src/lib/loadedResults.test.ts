import { describe, expect, it } from 'vitest';

import type { DecoratedRecommendation } from './recommendations';
import { findLoadedRecommendation, setLoadedRecommendations } from './loadedResults';

function stub(locationId: string, species: string): DecoratedRecommendation {
  return { locationId, species, locationName: `${locationId} refuge` } as DecoratedRecommendation;
}

describe('loadedResults', () => {
  it('finds nothing before a list has been loaded', () => {
    expect(findLoadedRecommendation('loc-1:snow-goose')).toBeNull();
  });

  it('hands the detail route the row the list tapped', () => {
    setLoadedRecommendations([stub('loc-1', 'snow-goose'), stub('loc-2', 'mallard')]);
    expect(findLoadedRecommendation('loc-2:mallard')?.locationName).toBe('loc-2 refuge');
  });

  it('distinguishes two species at the same refuge', () => {
    setLoadedRecommendations([stub('loc-1', 'snow-goose'), stub('loc-1', 'mallard')]);
    expect(findLoadedRecommendation('loc-1:mallard')?.species).toBe('mallard');
  });

  it('returns null for a key that is not in the current list', () => {
    setLoadedRecommendations([stub('loc-1', 'snow-goose')]);
    expect(findLoadedRecommendation('loc-9:mallard')).toBeNull();
  });
});
