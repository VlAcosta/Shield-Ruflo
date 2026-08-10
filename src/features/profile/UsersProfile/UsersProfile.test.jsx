import { canonicalRoleId } from './UsersProfile';

describe('UsersProfile canonical backend roles', () => {
  test('normalizes backend-shaped roles for selectors, owner exclusion, and counts', () => {
    const backendMember = { accessRoleId: 'manager' };
    const roles = [{ id: 'OWNER' }, { id: 'MANAGER' }, { id: 'MEMBER' }];

    expect(canonicalRoleId(backendMember.accessRoleId)).toBe('MANAGER');
    expect(roles.filter((role) => canonicalRoleId(role.id) !== 'OWNER').map((role) => role.id)).toEqual(['MANAGER', 'MEMBER']);
    expect([backendMember].filter((member) => canonicalRoleId(member.accessRoleId) === 'MANAGER')).toHaveLength(1);
  });
});
