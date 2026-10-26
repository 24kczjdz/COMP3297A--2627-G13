# LeaveFlowSE — raw requirements

Sources: the COMP3297A project specification for WorkSmartSE, and the Group 13 requirements note (Wang Lijia). The note’s staff-feature list has two handwritten marks, and both are kept below: “View own application histories” is marked **+ status**, and the in-system notification line is marked **derived**.

WorkSmartSE is a Hong Kong company of about 40 staff. Leave is handled today with paper forms and WhatsApp, then recorded in a spreadsheet. One approver checks every application. LeaveFlowSE is the web application that replaces that process: staff apply for leave, the approver decides, and leave records can be looked up by date.

## Roles

- **Staff** — every employee, including the approver.
- **Approver** — exactly one staff member. This person applies for their own leave and decides every application, including their own. Every staff story below also applies to the approver.

The source note spells the withdrawn state both “Canceled” and “Cancelled”. These stories use **Cancelled**. The course specification’s “reject” is the note’s **Disapproved**.

## User stories

### Staff

- **Sign in**
  - As a staff member, I want to sign in with the company email and password the approver assigned, so that I can use LeaveFlowSE.
  - Acceptance criteria:
    - Sign-in succeeds when the email and password match an account the approver created.
    - The email is a company email. An external email is refused, and staff cannot register themselves.
    - After sign-in, the staff member reaches their own profile, quota, balance, and applications. The approver signs in the same way and also reaches the approver functions.

- **View own profile**
  - As a staff member, I want to view my personal information, so that I can check the details held for me.
  - Acceptance criteria:
    - The profile shows email, name, staff ID, birthday, department, and year joined.
    - The signed-in staff member sees their own profile.
    - The approver sees their own profile through the same staff view.

- **View total quota**
  - As a staff member, I want to see my total leave quota, so that I know my annual and sick leave entitlement.
  - Acceptance criteria:
    - Each staff member has 18 days of annual leave and 14 days of sick leave.
    - One quota unit is one day, and the quota is shown in whole days.
    - The total is the entitlement, shown separately from quota already spent.

- **View quota balance**
  - As a staff member, I want to see my quota balance, so that I know how much leave I have already spent.
  - Acceptance criteria:
    - The balance shows quota already spent for annual leave and for sick leave.
    - Spent quota is shown in whole days.
    - The approver sees this same balance on their own staff account.

- **View own application history and status**
  - As a staff member, I want to see my application history with the status of each request, so that I know what I submitted and where it stands.
  - The printed requirement is “View own application histories”. The handwritten mark adds **+ status**. This is also the course specification’s “leave status”.
  - Acceptance criteria:
    - The history lists applications submitted by the signed-in staff member.
    - Each entry shows leave type, start date, end date, reason, and status.
    - The status is Pending, Approved, Disapproved, or Cancelled.

- **Submit a leave application**
  - As a staff member, I want to submit a leave application after I sign in, so that I can request leave without a paper form or a WhatsApp message.
  - Acceptance criteria:
    - The form takes leave type (annual leave or sick leave), start date, end date, and reason.
    - The request is stored in whole days. Its length is the number of calendar days from the start date through the end date, and one quota unit is one day.
    - The submitted application is Pending until the approver decides, and it appears in the applicant’s history.

- **Modify a pending application**
  - As a staff member, I want to change an application while it is still pending, so that I can correct it before the approver decides.
  - Acceptance criteria:
    - While the status is Pending, the applicant can change leave type, start date, end date, and reason.
    - The application stays Pending after the change, and the history shows the updated content.
    - Modification is available only while the status is Pending.

- **Cancel an application**
  - As a staff member, I want to cancel my own application, so that I can withdraw leave I no longer need.
  - Acceptance criteria:
    - The applicant can cancel a Pending application at any time, and the status becomes Cancelled.
    - The applicant can cancel an Approved application on any day up to the day before the leave starts, and the status becomes Cancelled.
    - After cancellation, the applicant’s history shows the application as Cancelled (withdrawn by the applicant).

- **Read the decision notification** *(marked “derived” on the source)*
  - As a staff member, I want an in-system notification when my application is approved or disapproved, so that I learn the decision inside LeaveFlowSE.
  - The printed bullet is underlined and labelled “derived”. The state diagram also says that approve and disapprove notify the staff member. This release has no external channel for that notice.
  - Acceptance criteria:
    - Approving an application leaves an in-system notification for the applicant.
    - Disapproving an application leaves an in-system notification for the applicant.
    - The applicant can read that notification after signing in.

### Approver

- **Create a staff account**
  - As the approver, I want to create a staff account with a company email and an initial password, so that the staff member can sign in.
  - Acceptance criteria:
    - The approver sets the email and the initial password when creating the account.
    - The email is a company email. An external email is refused.
    - The new staff member can sign in with that email and initial password.

- **Edit a staff profile**
  - As the approver, I want to edit a staff profile, so that personal details stay up to date.
  - Acceptance criteria:
    - The approver can update the details the staff member sees: email, name, staff ID, birthday, department, and year joined.
    - The staff member sees the updated details on their own profile.
    - Profile editing is an approver function. A staff member’s own use cases do not include editing a profile.

- **View pending applications**
  - As the approver, I want to see how many applications are pending and read each one, so that I know what is waiting for a decision.
  - Acceptance criteria:
    - The pending view shows the number of applications in Pending.
    - Each pending application shows the staff member, leave type, start date, end date, and reason.
    - The pending set is the submitted applications the approver has not yet decided.

- **Approve or disapprove an application**
  - As the approver, I want to approve or disapprove a pending application, so that the request is decided and filed.
  - Acceptance criteria:
    - The approver can approve or disapprove an application that is Pending.
    - Approve sets the status to Approved. Disapprove sets the status to Disapproved.
    - Approved and Disapproved applications are archived. The approver can decide their own leave application.

- **View all application histories for a leave date**
  - As the approver, I want to see every staff member’s leave records for a chosen date, so that I can see whose leave falls on that day.
  - Acceptance criteria:
    - The approver picks a date and sees applications from all staff whose leave period covers that date, from the start date through the end date.
    - The filter uses the day the staff member is on leave. The day the application was submitted does not select the record.
    - Each record shows the staff member, leave type, start date, end date, reason, and status.

## Open point recorded from the source

- The state diagram leaves a dashed question on Approved: whether anything further happens when the leave has been taken (“leave completed? (to be confirmed)”). No target state is given. That behaviour is unspecified.

## Non-functional requirements

- LeaveFlowSE is a web application. The team chooses the technology stack.
- The product is deployable in one of three ways: a free-tier cloud host, a Docker container, or a local machine with no dedicated operating-system requirement.
- The README gives full instructions to deploy and run the product. A cloud deployment also includes the link to the running application.
- This release has no external system interface. Sign-in does not call a company account system, and decisions stay inside LeaveFlowSE.
- The product is sized for about 40 staff and a single approver.
- Leave data is available only after sign-in with an approver-created company account. A staff member reaches their own profile, quota, and applications; the approver additionally reaches account management, pending decisions, and every staff member’s leave history.
- Passwords are assigned by the approver and are not shown on the staff profile.
