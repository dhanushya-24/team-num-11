Blood Bank and Donor Locator Website
📌 Project Overview

The Blood Bank and Donor Locator Website is a centralized web-based healthcare platform designed to efficiently manage blood donation, blood requests, and hospital stock information within a single integrated system.
Current blood donation solutions are fragmented—separate applications exist for donors, blood requests, and blood bank locations, with no real-time stock updates or coordination. This project overcomes those limitations by providing an all-in-one platform that connects donors, patients, and hospitals through structured workflows and a well-designed database system.
The platform focuses on data accuracy, availability, and biological safety, ensuring that donated blood is used within its medically safe time window.

🎯 Problem Statement

Existing blood bank systems face several challenges:
Separate applications for donation, request, and location services
No centralized blood stock management
No visibility of blood expiry or usability period
Manual coordination between hospitals and donors
Delayed responses during emergency situations
These limitations can lead to wastage of usable blood and delayed medical response.

✅ Proposed Solution

This project delivers a single web-based platform that:
Integrates donor registration, blood requests, and hospital stock updates
Tracks blood donation expiry based on biological safety standards
Enables hospitals to accept or decline requests digitally
Stores confirmation, review, and response details securely
Improves transparency and efficiency in blood management

👥 User Roles & Functional Workflow

🔹 Donor Module
Donors register and log in to the system
Blood group, donation date, and contact details are stored securely
Blood expiry is automatically calculated (valid for 54 days)
Donation history contributes to a donor leaderboard
Donors receive confirmation emails for actions taken

🔹 Blood Requester Module
Users register and submit blood requests
Request details are stored and forwarded to hospitals
Status updates are available based on hospital response
Request expiry calculation is handled separately

🔹 Hospital / Blood Bank Module
Hospitals register and log in securely
Update available blood stock by blood group
View incoming blood requests
Accept or decline requests based on stock availability
Can redirect to request pages for coordinated handling

🗄️ Database Architecture (Core Contribution)
The system uses SQLite for backend data storage, verified and managed using DB Browser for SQLite.
To maintain modularity, clarity, and scalability, five separate databases are implemented:

📂 Database Structure

donor.db
Stores donor profiles, blood group, donation date, and activity records
request.db
Stores blood request details and requester information
hospital.db
Stores hospital registration and authentication data
stock.db
Stores real-time blood stock availability updated by hospitals
confirmation.db
Stores:
Hospital responses (Accept / Decline)
Review and confirmation details
Communication status between users and hospitals

🔑 Key Database Concepts Applied

Modular database separation for clean architecture
Primary keys for unique identification
Logical relationships across databases
Data normalization to reduce redundancy
Secure and structured storage
Scalable design for future integration
This database design ensures high data integrity, easy debugging, and efficient querying.

🧬 Blood Expiry Calculation

Donated blood is considered safe for use up to 54 days from the donation date.
This limit is based on biological safety, as the quality of white blood cells and other blood components degrades beyond this period.
Implementation Highlights:
Expiry date is auto-calculated and stored in the database
Visible to both donors and hospitals
Prevents unsafe or expired blood from being issued
Reduces blood wastage while ensuring patient safety

🏆 Donor Leaderboard

Tracks donor activity based on valid donations
Encourages regular and responsible blood donation
Promotes community participation and awareness

📧 Email Communication (High-Level)

Email confirmations are sent for:
Registration
Donation confirmation
Request acceptance or rejection
Implemented using Brevo API
(Technical details handled separately)

🔐 Security & Reliability

HTTPS-based web platform
Role-based data access
Controlled database updates
Secure credential handling

🛠️ Technologies Used

Frontend: HTML, CSS, JavaScript
Backend: Python (Flask)
Database: SQLite
Email Service: Brevo API
Tools: DB Browser for SQLite, GitHub

🌍 Project Domain

Web Application Development
Database Management Systems (DBMS)
Healthcare Information Systems

🚀 Future Enhancements

Unified relational database with role-based access
Emergency priority tagging
Analytics dashboard for hospitals
Mobile-responsive UI

👨‍💻 Team Information

Team Number: 11
Team Size: 4 Members
Each member contributed to different modules including database design, backend logic, frontend interface, and communication services.

📌 Conclusion

This project demonstrates how structured database design and web technologies can be effectively applied to solve real-world healthcare challenges.
By integrating donors, requesters, and hospitals into a single system—with expiry tracking and confirmation handling—the platform improves blood availability, safety, and response efficiency during critical situations.
