/**
 * The deep-link allowlist (C-7 Delivery) as an accept/reject table.
 *
 * This is the security boundary for a toast click: a route that gets through here is handed
 * to `loadURL`. The reject list is deliberately full of the shapes that would escape the app
 * origin — schemes, hosts, protocol-relative paths, dot segments, fragments.
 */

import { describe, expect, it } from 'vitest';

import { HOME_ROUTE, allowedRouteOrHome, courseGradesRoute, isAllowedRoute } from '../../src/core/route';

const ACCEPT = [
  '/',
  '/inbox',
  '/grades',
  '/planner',
  '/announcements',
  '/course/IST.323/grades',
  '/course/IST.323/stream',
  '/course/IST.323/classwork',
  '/course/IST.323/info',
  '/course/GEO.103.lecture/grades',
  '/course/MAT.295/info',
  '/?tab=open',
  '/inbox?state=open&kind=gap',
  '/course/IST.323/grades?column=col%3A9001',
  '/planner?week=2026-09-14',
];

const REJECT = [
  '',
  'inbox',
  '//evil.example',
  'https://evil.example/',
  'http://localhost/inbox',
  'file:///C:/Windows/System32',
  'javascript:alert(1)',
  '/../secrets',
  '/inbox/../../etc',
  '/course/ist.323/grades',
  '/course/IST.32/grades',
  '/course/IST.323/settings',
  '/course/IST.323',
  '/course/IST.323/grades#top',
  '/inbox ',
  '/inbox?q=<script>',
  '/unknown',
  '/inbox\n/grades',
];

describe('isAllowedRoute', () => {
  it.each(ACCEPT)('accepts %j', (route) => {
    expect(isAllowedRoute(route)).toBe(true);
  });

  it.each(REJECT)('rejects %j', (route) => {
    expect(isAllowedRoute(route)).toBe(false);
  });

  it.each([null, undefined, 42, {}, ['/inbox']])('rejects the non-string %j', (route) => {
    expect(isAllowedRoute(route)).toBe(false);
  });
});

describe('allowedRouteOrHome', () => {
  it('passes a valid route through', () => {
    expect(allowedRouteOrHome('/inbox')).toBe('/inbox');
  });

  it('degrades anything else to Home', () => {
    expect(allowedRouteOrHome('https://evil.example')).toBe(HOME_ROUTE);
  });
});

describe('courseGradesRoute', () => {
  it('builds the grades route for a well-formed course id', () => {
    expect(courseGradesRoute('IST.323')).toBe('/course/IST.323/grades');
    expect(courseGradesRoute('GEO.103.lecture')).toBe('/course/GEO.103.lecture/grades');
  });

  it('degrades to Home for anything else', () => {
    expect(courseGradesRoute('../../etc')).toBe('/');
    expect(courseGradesRoute('')).toBe('/');
    expect(courseGradesRoute('IST.323/../..')).toBe('/');
  });
});
