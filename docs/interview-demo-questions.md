# Interview Simulator — Demo Questions & Model Answers

Reference document for the "Try Demo" feature (`backend/src/services/interview.service.ts`, `DEMO_QUESTIONS`). Each topic has 5 short, factual/definitional questions that **ramp from easy to hard** (difficulty 1 → 5), like a real interview warm-up — the form's difficulty slider is ignored for demo sessions, since every demo intentionally shows the full easy/hard mix regardless of what's selected. Questions are kept to **one-line, single-sentence answers** on purpose: open-ended behavioral/situational questions require long spoken answers, and those are the ones most likely to get mangled by the browser's speech-to-text and unfairly tank the demo score. The model answers below are reference-quality one-liners — what the real AI scorer (Module D `/analyze-response`) would consider a strong answer, useful when demoing the product or sanity-checking the AI's scoring.

---

## Frontend Development

**1. (Difficulty 1 · Technical) What does CSS stand for?**

> Cascading Style Sheets — the language used to style and lay out HTML elements.

**2. (Difficulty 2 · Technical) What's the difference between `let` and `var` in JavaScript?**

> `let` is block-scoped and can only be declared once per scope, while `var` is function-scoped and can be redeclared, which makes it more error-prone — modern code generally prefers `let` (or `const`) over `var`.

**3. (Difficulty 3 · Technical) What is the CSS Box Model?**

> It describes how every element is rendered as four layers from the inside out — content, padding, border, and margin — which together determine the element's total size on the page.

**4. (Difficulty 4 · Technical) What is the Virtual DOM?**

> It's an in-memory copy of the real DOM that frameworks like React use to calculate the minimal set of changes needed before updating the actual page, which is faster than manipulating the real DOM directly.

**5. (Difficulty 5 · Technical) What is CSS specificity?**

> It's the set of rules the browser uses to decide which conflicting style wins when multiple selectors target the same element, roughly ranked inline styles > IDs > classes > element selectors.

---

## Backend Development

**1. (Difficulty 1 · Technical) What does API stand for?**

> Application Programming Interface — a defined way for two pieces of software to communicate with each other.

**2. (Difficulty 2 · Technical) What's the difference between a `GET` and a `POST` request?**

> `GET` retrieves data without changing anything on the server, while `POST` sends data to the server to create or change something.

**3. (Difficulty 3 · Technical) What is a REST API?**

> A web API that follows REST principles — stateless requests, resources identified by URLs, and standard HTTP methods like GET, POST, PUT, and DELETE to act on them.

**4. (Difficulty 4 · Technical) What is database indexing used for?**

> It creates a separate lookup structure so the database can find matching rows without scanning the entire table, which makes reads significantly faster at the cost of extra storage and slightly slower writes.

**5. (Difficulty 5 · Technical) What does it mean for an API endpoint to be idempotent?**

> Calling it multiple times with the same input produces the same result as calling it once — so retries are safe and don't cause duplicate side effects.

---

## DevOps

**1. (Difficulty 1 · Technical) What does CI/CD stand for?**

> Continuous Integration / Continuous Deployment — automatically testing and shipping code changes as they're merged.

**2. (Difficulty 2 · Technical) What's the difference between a Docker image and a Docker container?**

> An image is a read-only, versioned template for an application, while a container is a running (or stopped) instance of that image.

**3. (Difficulty 3 · Technical) What is a load balancer?**

> A component that distributes incoming traffic across multiple servers so no single one gets overwhelmed, and can reroute around unhealthy instances.

**4. (Difficulty 4 · Technical) What's the difference between horizontal and vertical scaling?**

> Vertical scaling adds more resources (CPU/RAM) to a single existing machine, while horizontal scaling adds more machines running the same service behind a load balancer.

**5. (Difficulty 5 · Technical) What is Infrastructure as Code?**

> Defining and managing servers and infrastructure through version-controlled configuration files instead of manual, click-through setup.

---

## Data Science

**1. (Difficulty 1 · Technical) What does ML stand for?**

> Machine Learning — training a model to find patterns in data instead of hardcoding explicit rules.

**2. (Difficulty 2 · Technical) What's the difference between supervised and unsupervised learning?**

> Supervised learning trains on labeled data with known correct outputs, while unsupervised learning finds structure in unlabeled data on its own, like clustering.

**3. (Difficulty 3 · Technical) What is overfitting in a machine learning model?**

> When a model learns the training data too closely, including its noise, so it performs well on training data but poorly on new, unseen data.

**4. (Difficulty 4 · Technical) What's the difference between precision and recall?**

> Precision measures how many of the model's positive predictions were actually correct, while recall measures how many of the actual positives the model successfully caught.

**5. (Difficulty 5 · Technical) What is a confusion matrix used for?**

> It's a table showing correct vs. incorrect predictions broken down by class, used to evaluate a classifier's performance beyond a single accuracy number.

---

## System Design

**1. (Difficulty 1 · Technical) What is a database?**

> An organized system for storing, retrieving, and managing data reliably.

**2. (Difficulty 2 · Technical) What's the difference between a SQL and a NoSQL database?**

> SQL databases use a fixed schema and related tables with strong consistency, while NoSQL databases use flexible schemas — like documents or key-value pairs — that trade some structure for easier horizontal scaling.

**3. (Difficulty 3 · Technical) What is caching used for in a system?**

> Storing frequently-accessed data in fast temporary storage so repeated requests don't have to be recomputed or refetched from a slower source every time.

**4. (Difficulty 4 · Technical) What is database sharding?**

> Splitting a large database into smaller pieces ("shards") spread across multiple servers so no single server has to hold or serve all the data.

**5. (Difficulty 5 · Technical) What is eventual consistency?**

> A consistency model where, after a write, all replicas of the data will match up over time, but might briefly return different values in the meantime.

---

## Full-Stack Development

**1. (Difficulty 1 · Technical) What's the difference between the frontend and the backend of a web application?**

> The frontend is what runs in the user's browser — the UI they see and interact with — while the backend is the server-side logic, database access, and APIs behind it.

**2. (Difficulty 2 · Technical) What's the difference between authentication and authorization?**

> Authentication verifies who a user is, while authorization determines what that already-identified user is allowed to do.

**3. (Difficulty 3 · Technical) What is an API endpoint?**

> A specific URL where an API receives requests and returns a response for a particular action or resource.

**4. (Difficulty 4 · Technical) What is CORS?**

> Cross-Origin Resource Sharing — a browser security rule that controls whether a webpage is allowed to make requests to a different domain than the one it was loaded from.

**5. (Difficulty 5 · Technical) What is server-side rendering?**

> A rendering approach where the HTML for a page is generated on the server and sent ready-to-display, rather than being built in the browser with JavaScript after the page loads.

---

## Source

Question text and per-question difficulty live in `backend/src/services/interview.service.ts` (`DEMO_QUESTIONS` constant). These model answers are reference material only — they are **not** sent to Module D or used anywhere in scoring; the real AI (`/analyze-response`) scores whatever the user actually types or speaks during a demo session.
