import type { PrismaClient } from '@prisma/client';

export class LocationError extends Error { constructor(public code: 'UNKNOWN_REGION', message: string) { super(message); } }
export type LocationView = { region: { code: string; name: string } | null; consentedAt: string | null };
export type LocationService = {
  mine(userId: string): Promise<LocationView>;
  choose(userId: string, code: string): Promise<LocationView>;
  withdraw(userId: string): Promise<LocationView & { clearedEvents: number }>;
};

// Optional, explicit, country-level location (ARCHITECTURE.md "Privacy and reproducibility").
// Choosing records consent time. Moving to another region keeps earlier listens' snapshot
// (it was true when they happened). Withdrawing clears the profile region and removes the
// region from all of the user's past listening events, in one transaction.
export function locationService(database: PrismaClient, now: () => number = Date.now): LocationService {
  const view = async (userId: string): Promise<LocationView> => {
    const user = await database.user.findUniqueOrThrow({ where: { id: userId }, select: { locationConsentAt: true, region: { select: { code: true, name: true } } } });
    return { region: user.region, consentedAt: user.locationConsentAt?.toISOString() ?? null };
  };
  return {
    mine: view,
    async choose(userId, code) {
      const region = await database.region.findUnique({ where: { code }, select: { id: true } });
      if (!region) throw new LocationError('UNKNOWN_REGION', 'Unknown region');
      await database.user.update({ where: { id: userId }, data: { regionId: region.id, locationConsentAt: new Date(now()) } });
      return view(userId);
    },
    async withdraw(userId) {
      const cleared = await database.$transaction(async tx => {
        await tx.user.update({ where: { id: userId }, data: { regionId: null, locationConsentAt: null } });
        return (await tx.listeningEvent.updateMany({ where: { userId, regionId: { not: null } }, data: { regionId: null } })).count;
      });
      return { region: null, consentedAt: null, clearedEvents: cleared };
    },
  };
}
