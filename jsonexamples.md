# Test Examples

POST /auth/create-organization
{
  "organizationName": "Acme Corp",
  "adminEmployeeId": "SA001",
  "adminName": "Ada Owner",
  "email": "<ada@acmecorp.com>",
  "password": "Passw0rd!",
  "confirmPassword": "Passw0rd!"
}

POST /auth/login
{
  "email": "ada@acmecorp.com",
  "password": "Passw0rd!"
}

POST /departments
{ "name": "Engineering" }
Reponse:
{
    "id": "c50206fb-b55c-4e12-b9a1-3431f2a4aacf",
    "name": "Engineering",
    "organizationId": "dee1bd05-f099-42b0-88ce-851afa9676f3",
    "createdAt": "2026-08-11T10:47:17.417Z",
    "updatedAt": "2026-08-11T10:47:17.417Z"
}

accessToken:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmODgxNzkzMS0wNTBhLTQ4MWItYTFjZC03MjViNWQ3YjVhYWYiLCJlbWFpbCI6ImFkYUBhY21lY29ycC5jb20iLCJyb2xlIjoiU1VQRVJfQURNSU4iLCJpYXQiOjE3ODY0NDUwODcsImV4cCI6MTc4NjQ0ODY4N30.e8rdfSANoJXbGgVZvxD-q9i9f1QaiK7NDVdtkw1CnlQ
refreshToken: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmODgxNzkzMS0wNTBhLTQ4MWItYTFjZC03MjViNWQ3YjVhYWYiLCJlbWFpbCI6ImFkYUBhY21lY29ycC5jb20iLCJyb2xlIjoiU1VQRVJfQURNSU4iLCJpYXQiOjE3ODY0NDUwODcsImV4cCI6MTc4NzA0OTg4N30.iaRiLkf7PWumUBcAYBR4tT18Ez5AFxGFek6hH8-TmVc

{
  "employeeId": "EMP001",
  "name": "Jane Doe",
  "email": "test2@globalindex.com",
  "organizationId": "dee1bd05-f099-42b0-88ce-851afa9676f3",
  "password": "Passw0rd!",
  "confirmPassword": "Passw0rd!",
  "role": "EMPLOYEE",
  "departmentId": "c50206fb-b55c-4e12-b9a1-3431f2a4aacf",
  "officeId": null
}

{
  "employeeId": "ELN-004",
  "name": "John David",
  "email": "johndavid@jpeg.com",
  "role":"HR_ADMIN",
  "departmentId": "c50206fb-b55c-4e12-b9a1-3431f2a4aacf"
}

POST /users
{
  "employeeId": "ELN-004",
  "name": "John David",
  "email": "johndavid@jpeg.com",
  "role":"HR_ADMIN",
  "departmentId": "c50206fb-b55c-4e12-b9a1-3431f2a4aacf"
}
{
    "id": "cd140b2b-421f-4c03-86b8-229628531b30",
    "employeeId": "ELN-004",
    "name": "John David",
    "email": "johndavid@jpeg.com",
    "role": "HR_ADMIN",
    "status": "PENDING",
    "departmentId": "c50206fb-b55c-4e12-b9a1-3431f2a4aacf",
    "officeId": null,
    "activationToken": "8eb39e10ffa5a27137fe52428cda0d34183274c64dceaa2f7ab23131d2a00f10"
}

POST /auth/complete-registration
{
  "token": "8eb39e10ffa5a27137fe52428cda0d34183274c64dceaa2f7ab23131d2a00f10",
  "password": "Passw0rd!",
  "confirmPassword": "Passw0rd!"
}
