# KONGU Engineering College: Contact, Attendance & Placement Portal

A full-stack portal for KONGU Engineering College with three kinds of login:

- **Students**: their own details, period-wise attendance, on-duty requests, placement opt-in/out and round results, and the staff directory.
- **Department staff** (faculty): their own department only. They manage students and staff of that department, mark attendance for each period by year and section, handle on-duty requests, and run reports.
- **Placement coordinator** (`placement.DEPT@kongu.edu`): placements only. No student or staff data outside the placement drives.

- **Frontend:** React 18, React Router, Vite
- **Backend:** Node.js, Express, JWT login, bcrypt-hashed passwords
- **Storage:** a JSON file (`server/data/db.json`) created on first run with sample data. No database needs installing.

## Run it
https://kec-contact.onrender.com/

Requires Node.js 18 or newer.

```bash
npm run install:all     # installs root, server and client dependencies (do this first)
ADMIN_EMAIL=admin@kongu.edu ADMIN_PASSWORD='Choose-A-Strong-Pass1' npm run dev
```

Open http://localhost:5173 (API on :4000).

The system starts **empty**. The first administrator is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` the first time the server starts. Sign in with the **Administrator** tab, then add the department staff, placement coordinators and students. Nothing else is seeded.

Single-server mode: `npm start` builds the client and serves everything on one port.
Tests: `npm test` (server API tests).

**Upgrading from an earlier version:** delete `server/data/db.json` (and `server/data/uploads/` if you want old proofs gone). The data format changed, so old data is not compatible.

## Accounts and email rules

| Who | Created by | Email | Sees |
| --- | --- | --- | --- |
| Administrator | `ADMIN_EMAIL` / `ADMIN_PASSWORD` at first start | any | All people in every department; creates staff, coordinators and students; sets timetables |
| Department staff (faculty) | Administrator or department staff | `name.DEPT@kongu.edu` | Own department only: students, attendance, CAT marks, on duty, timetable |
| Placement coordinator (TPO) | Administrator or department staff | `placement.DEPT@kongu.edu` | Placements only |
| Student | Administrator, department staff, or self-registration | college address | Own record, timetable, own attendance and CAT marks, staff directory, placements |

The department and role come from the email. Use the department code in lowercase, without spaces or hyphens (for example `ct-ug` becomes `ctug`).

## Academic record (students)

Entered by department staff or the administrator:

- 10th and 12th percentage
- Semester GPA for semesters 1 to 8
- CGPA (left blank, it is the average of the semesters entered)
- Number of arrears

## Timetable

- Each class (year and section) has a timetable of Monday to Saturday, periods 1 to 8.
- Each period has a **subject** and one **staff member**.
- The timetable is visible to staff and students. Staff and the administrator set it.

## Attendance

- The register shows students down the page and periods 1 to 8 across.
- Each staff member marks **only the periods they teach** (from the timetable). Other periods are shown read-only.
- Marks: **P** present, **A** absent, **OD** on duty. Click a cell to change it, then save.
- Approved on-duty days count as present in every period.
- Attendance cannot be marked for a future date.
- Reports show totals and percentages by year and section, with a "below 75%" filter, PDF and CSV.

## CAT marks

- Three tests per subject: **CAT1, CAT2, CAT3**, each out of **50**.
- Only the staff member who teaches the subject to that class can enter its marks.
- **Only the student sees their own CAT marks.** Staff enter them, and the administrator cannot read them.

## Placements

- The placement coordinator (TPO) sets the eligibility for each drive: 10th minimum %, 12th minimum %, CGPA minimum, maximum arrears. Blank means no limit.
- A student who does not meet the criteria cannot opt in, and sees the reason (for example "CGPA 6.5 is below the 7 minimum").
- Students opt in or out while the drive is open, and see their round results.
- The PDF report covers the coordinator's own department.

## Departments

17 departments, all shown with their **full names**: AIDS, AIML, CSE, CSD, CIVIL, MECH, AUTOMOBILE, NATUROPATHY, CT-UG, MBA, MCA, IT, CHEMICAL, FOOD TECH, EEE, ECE and EIE. Edit `server/src/departments.js` to change them.

## Security notes

- Passwords are hashed with bcrypt; sessions are JWTs that expire after 8 hours and stop working when the password is changed.
- Failed logins are rate limited, and login errors do not reveal whether an email exists.
- Use a strong `ADMIN_PASSWORD`, then change it after first sign-in.
- Before real use, serve it over **HTTPS**, and consider moving from the JSON file to a real database (only `server/src/store.js` touches storage).

## Configuration (environment variables)

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | API port | 4000 |
| `DATA_FILE` | Path of the data file | `server/data/db.json` |
| `JWT_SECRET` | Token signing secret | auto-generated |
| `ADMIN_EMAIL` | Email of the administrator created at first start | none |
| `ADMIN_PASSWORD` | Password of that administrator (at least 8 characters, with a letter and a number) | none |

## Project structure

```
college-contacts/
├── server/
│   ├── src/
│   │   ├── index.js          # starts the server; creates the administrator from env
│   │   ├── app.js            # Express app, security headers, static client
│   │   ├── auth.js           # JWT, role guards, login rate limiter
│   │   ├── academic.js       # academics, CAT, timetable and eligibility rules
│   │   ├── departments.js    # 17 departments, sections, periods, staff email parser
│   │   ├── store.js          # JSON-file persistence
│   │   ├── seed.js           # sample data for tests only
│   │   └── routes/           # auth, contacts, attendance, timetable, cat, onduty, placements
│   └── test/                 # API and feature tests
└── client/src/
    ├── academic.js           # sections, periods, years (keep in step with the server)
    ├── pages/                # Login, Dashboard, Directory, Timetable, Attendance (register), CAT, OnDuty, Placements, Profile
    └── components/           # Layout (role menus), forms, modals, attendance widgets
```
