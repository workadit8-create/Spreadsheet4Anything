-- Reset password akun role-play hybrid-lab (selaras docs/ROLES.md)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE auth.users
SET
  encrypted_password = crypt(pwd, gen_salt('bf')),
  updated_at = now()
FROM (
  VALUES
    ('staff.hybrid@premium-web.app', 'HybridStaff2026!'),
    ('akuntan.hybrid@premium-web.app', 'HybridAkuntan2026!')
) AS t(email, pwd)
WHERE auth.users.email = lower(t.email);

SELECT u.email, m.role
FROM auth.users u
JOIN memberships m ON m.user_id = u.id
JOIN organizations o ON o.id = m.organization_id
WHERE o.slug = 'hybrid-lab' AND u.email LIKE '%hybrid@premium-web.app'
ORDER BY u.email;
