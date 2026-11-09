import { FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH } from './skywardPages';

export function isSkywardPublic(pathname: string): boolean {
  return (
    pathname === FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH ||
    pathname === '/skyward/attendance' ||
    pathname === '/skyward/schedule'
  );
}
