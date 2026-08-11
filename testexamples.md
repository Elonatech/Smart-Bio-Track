# Test Examples

<!-- ========================== -->
<!-- Auth -->
POST /auth/register
{
  "employeeId": "EMP001",
  "name": "Jane Doe",
  "email": "{use any email address}",
  "password": "Passw0rd!",
  "confirmPassword": "Passw0rd!",
  "role": "EMPLOYEE",
  "departmentId": null,
  "officeId": null
}

POST /auth/login
{
  "email": "<jane+1@example.com>",
  "password": "Passw0rd!"
}

POST /auth/refresh
{
  "refreshToken": "{refreshToken value from register or login response}"
}
