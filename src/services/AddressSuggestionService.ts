import { AddressSuggestion } from '../types';
import { GoogleMapsService } from './GoogleMapsService';
import { LocationService } from './LocationService';

type FocusLocation = { latitude: number; longitude: number } | undefined;

type HybridParams = {
  query: string;
  recentDestinations: AddressSuggestion[];
  countryCode?: string;
  focusLocation?: FocusLocation;
  limit?: number;
};

type HybridResult = {
  local: AddressSuggestion[];
  network: AddressSuggestion[];
  merged: AddressSuggestion[];
};

export class AddressSuggestionService {
  private static resolvedSuggestions: AddressSuggestion[] = [];

  static registerResolvedSuggestion(
    suggestion: Pick<AddressSuggestion, 'label' | 'queryValue' | 'latitude' | 'longitude'> | null | undefined
  ) {
    if (!suggestion?.label?.trim()) return;
    const label = suggestion.label.trim();
    const latitude = Number(suggestion.latitude);
    const longitude = Number(suggestion.longitude);
    const normalized: AddressSuggestion = {
      id: `resolved:${label.toLowerCase()}`,
      label,
      queryValue:
        suggestion.queryValue ||
        (Number.isFinite(latitude) && Number.isFinite(longitude)
          ? `${latitude},${longitude}`
          : label),
      latitude,
      longitude,
      source: 'recent',
      qualityScore: 65,
      matchKind: 'local_prefix',
    };

    const next = [
      normalized,
      ...this.resolvedSuggestions.filter(
        (item) =>
          item.label.toLowerCase() !== normalized.label.toLowerCase() &&
          item.queryValue !== normalized.queryValue
      ),
    ].slice(0, 24);
    this.resolvedSuggestions = next;
  }

  static getInstantSuggestions(
    query: string,
    recentDestinations: AddressSuggestion[],
    focusLocation?: FocusLocation,
    limit: number = 6
  ): AddressSuggestion[] {
    const normalizedQuery = this.normalize(query);
    if (!normalizedQuery) return [];

    const mergedCandidates = [
      ...recentDestinations,
      ...this.resolvedSuggestions,
    ];
    const deduped = new Map<string, AddressSuggestion>();
    for (const item of mergedCandidates) {
      const key = `${item.queryValue}|${this.normalize(item.label)}`;
      const existing = deduped.get(key);
      if (!existing || (item.qualityScore || 0) > (existing.qualityScore || 0)) {
        deduped.set(key, item);
      }
    }

    const scored: AddressSuggestion[] = [];
    for (const item of deduped.values()) {
      const score = this.scoreLocalSuggestion(normalizedQuery, item, focusLocation);
      if (score <= 0) continue;

      const latitude = Number(item.latitude);
      const longitude = Number(item.longitude);
      const distanceKmFromUser =
        focusLocation &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
          ? LocationService.calculateDistanceSync(
              focusLocation.latitude,
              focusLocation.longitude,
              latitude,
              longitude
            )
          : undefined;

      scored.push({
        ...item,
        qualityScore: score,
        matchKind: 'local_prefix',
        distanceKmFromUser,
      });
    }

    return scored.sort((a, b) => b.qualityScore - a.qualityScore).slice(0, limit);
  }

  static async getHybridSuggestions(params: HybridParams): Promise<HybridResult> {
    const query = params.query.trim();
    const limit = params.limit || 6;
    if (!query) {
      return { local: [], network: [], merged: [] };
    }

    const local = this.getInstantSuggestions(
      query,
      params.recentDestinations,
      params.focusLocation,
      limit
    );

    let network: AddressSuggestion[] = [];
    if (query.length >= 2) {
      network = await GoogleMapsService.getGeocodeSuggestions(query, {
        countryCode: params.countryCode,
        focusLocation: params.focusLocation,
      });
    }

    const merged = this.mergeSuggestions(query, local, network, params.focusLocation, limit);
    return { local, network, merged };
  }

  static shouldAutoResolveTopSuggestion(
    query: string,
    topSuggestion: AddressSuggestion | null | undefined
  ): boolean {
    if (!topSuggestion) return false;
    const normalizedQuery = this.normalize(query);
    const normalizedLabel = this.normalize(topSuggestion.label);
    if (!normalizedQuery || !normalizedLabel) return false;

    const houseQuery = this.extractLeadingHouseNumber(normalizedQuery);
    const houseLabel = this.extractLeadingHouseNumber(normalizedLabel);
    const includesAllPrimaryTokens = normalizedQuery
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .every((token) => normalizedLabel.includes(token));

    const strongNumericMatch =
      Boolean(houseQuery) && Boolean(houseLabel) && houseQuery === houseLabel;

    return (
      strongNumericMatch ||
      (topSuggestion.qualityScore >= 120 && includesAllPrimaryTokens)
    );
  }

  private static mergeSuggestions(
    query: string,
    local: AddressSuggestion[],
    network: AddressSuggestion[],
    focusLocation: FocusLocation,
    limit: number
  ): AddressSuggestion[] {
    const normalizedQuery = this.normalize(query);
    const queryHouseNumber = this.extractLeadingHouseNumber(normalizedQuery);

    const merged = new Map<string, AddressSuggestion>();
    for (const item of [...local, ...network]) {
      const key = `${item.queryValue}|${this.normalize(item.label)}`;
      const existing = merged.get(key);
      if (!existing || (item.qualityScore || 0) > (existing.qualityScore || 0)) {
        merged.set(key, item);
      }
    }

    const ranked = Array.from(merged.values()).map((item) => {
      let score = Number(item.qualityScore) || 0;
      const normalizedLabel = this.normalize(item.label);
      const labelHouseNumber = this.extractLeadingHouseNumber(normalizedLabel);
      if (normalizedLabel.startsWith(normalizedQuery)) score += 40;

      if (queryHouseNumber && labelHouseNumber === queryHouseNumber) {
        score += 65;
      }

      if (focusLocation && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) {
        const distanceKm = LocationService.calculateDistanceSync(
          focusLocation.latitude,
          focusLocation.longitude,
          item.latitude,
          item.longitude
        );
        if (distanceKm < 3) score += 22;
        else if (distanceKm < 15) score += 14;
        else if (distanceKm < 60) score += 8;
      }

      return { ...item, qualityScore: score };
    });

    return ranked.sort((a, b) => b.qualityScore - a.qualityScore).slice(0, limit);
  }

  private static scoreLocalSuggestion(
    normalizedQuery: string,
    candidate: AddressSuggestion,
    focusLocation?: FocusLocation
  ): number {
    const normalizedLabel = this.normalize(candidate.label);
    if (!normalizedLabel) return 0;

    let score = Number(candidate.qualityScore) || 0;
    const tokens = normalizedQuery.split(' ').filter(Boolean);
    const queryHouseNumber = this.extractLeadingHouseNumber(normalizedQuery);
    const labelHouseNumber = this.extractLeadingHouseNumber(normalizedLabel);

    if (normalizedLabel.startsWith(normalizedQuery)) score += 120;
    else if (normalizedLabel.includes(normalizedQuery)) score += 70;

    if (queryHouseNumber && labelHouseNumber === queryHouseNumber) {
      score += 80;
    } else if (queryHouseNumber && normalizedLabel.includes(queryHouseNumber)) {
      score += 45;
    }

    const tokenPrefixMatches = tokens.filter((token) =>
      normalizedLabel
        .split(' ')
        .some((labelToken) => labelToken.startsWith(token))
    ).length;
    score += tokenPrefixMatches * 22;

    if (focusLocation && Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude)) {
      const distanceKm = LocationService.calculateDistanceSync(
        focusLocation.latitude,
        focusLocation.longitude,
        candidate.latitude,
        candidate.longitude
      );
      if (distanceKm < 2) score += 25;
      else if (distanceKm < 10) score += 16;
      else if (distanceKm < 40) score += 8;
    }

    return score;
  }

  private static extractLeadingHouseNumber(value: string): string | null {
    const match = value.match(/^(\d{1,6})\b/);
    return match?.[1] || null;
  }

  private static normalize(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
  }
}
