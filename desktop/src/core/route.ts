/**
 * Route allowlist (C-7 Delivery), kept in `core/` because it is pure string work and a
 * container port needs it too (C-13). `main/deeplink.ts` is the Electron adapter that
 * calls it; the reducer calls it as well so no toast can ever carry a route the click
 * handler would refuse.
 *
 * The pattern is the one frozen in the Contract, character for character.
 */

/** Frozen in C-7 Delivery. Anchored; no dot-segments, no scheme, no protocol-relative URL. */
export const ROUTE_PATTERN =
  /^\/(|inbox|grades|planner|announcements|course\/[A-Z]{3}\.\d{3}(\.[a-z]+)?\/(grades|stream|classwork|info))(\?[\w=&:%.-]*)?$/;

/** The route every rule falls back to when a composed one does not validate. */
export const HOME_ROUTE = '/';

/**
 * True when `route` is one the shell may navigate to. Anything that is not a string,
 * or that carries a scheme, a host, a `..` segment or a fragment, is rejected.
 */
export function isAllowedRoute(route: unknown): route is string {
  return typeof route === 'string' && ROUTE_PATTERN.test(route);
}

/**
 * `route` when it validates, `HOME_ROUTE` otherwise. Used by the reducer so a course id
 * that does not match the frozen `AAA.999[.suffix]` shape degrades to Home rather than
 * producing a toast whose click does nothing.
 */
export function allowedRouteOrHome(route: string): string {
  return isAllowedRoute(route) ? route : HOME_ROUTE;
}

/** `/course/<courseId>/grades`, or Home when `courseId` is not a well-formed course id. */
export function courseGradesRoute(courseId: string): string {
  return allowedRouteOrHome(`/course/${courseId}/grades`);
}
