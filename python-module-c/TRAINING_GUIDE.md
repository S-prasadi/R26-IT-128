> ✅ **Status update (2026-08-18):** everything in Section 4 below has been built. This guide's concepts are still accurate and worth reading for the *why* — but for current status, results, and the actual scripts/reports, see [`IMPROVEMENT_PLAN.md`](./IMPROVEMENT_PLAN.md) and [`EVALUATION_SUMMARY.md`](./EVALUATION_SUMMARY.md).

# Learning Guide: Model Training & Data Engineering (for the CV↔Job model)

This guide is written around **your own notebook**: `backend/models/CV_Job_Model (3).ipynb`. Every concept below is explained first in plain words, then pointed at the exact cell in your notebook where it already happens. By the end you should be able to read that notebook line by line and know *why* each step exists — and know exactly what to change to act on your supervisor's feedback.

Read it top to bottom once. Then keep it open next to the notebook while you work.

---

## 0. The big picture — what "training a model" actually means

People say "train a model" like it's one step. It's really a pipeline of small, separate jobs:

```
Raw data  →  Clean data  →  Features (X)  →  Label (y)  →  Split  →  Train  →  Evaluate  →  Tune  →  Save
```

- **Raw data** — the messy real-world thing (CVs, job posts).
- **Clean data** — the same data with typos, duplicates, and inconsistent formatting fixed.
- **Features (X)** — the numbers/categories you feed the model to make a prediction. This is called **data engineering** or **feature engineering** — deciding *what to measure* about each CV.
- **Label (y)** — the correct answer the model is trying to learn to predict. Also called the **target**.
- **Split** — dividing your data into a part the model learns from and a part you hide from it, to test honestly.
- **Train** — the algorithm looks at (X, y) pairs from the training part and finds a pattern.
- **Evaluate** — you check how well the pattern generalizes, using the hidden test part.
- **Tune** — you adjust the algorithm's settings to get a better result, and re-check.
- **Save** — you write the trained model to a file (`.pkl`) so your app can load it without retraining.

Your notebook does all nine of these. Here's the map:

| Pipeline stage | Your notebook |
|---|---|
| Raw data | Step 1 (`cleaned_cv_dataset.json`, `cleaned_job_posts_dataset.csv`) |
| Clean data | Step 4 (`clean_text`, `parse_list`, `normalize_skill`) |
| Features (X) | Step 6–7 (`compare_cv_with_role`, the score components) |
| Label (y) | Step 7 (`final_score`) |
| Split | Step 10 (`train_test_split`) |
| Train | Step 10 (`score_model.fit(...)`) |
| Evaluate | Step 10 (`mean_absolute_error`, `r2_score`) |
| Tune | **missing** — this is what your supervisor is asking for |
| Save | Step 11 (`joblib.dump`) |

---

## 1. Data engineering — turning messy data into numbers

### 1.1 What raw data you actually have

Your notebook loads two datasets that were uploaded by hand into Google Colab (Step 1–2):

- `cleaned_job_posts_dataset.csv` — **2,400 job posts**, 13 columns (title, company, extracted skills, target role, …).
- `cleaned_cv_dataset.json` — **2,066 CVs**, 32 columns (skills, experience, projects, certificates, an `evaluation_score`, …).

> ⚠️ **Important:** neither file exists in this repository. They only exist wherever you uploaded them from in Colab (your Google Drive or local disk). Before you can retrain anything, **find these two files and add them to the project** (e.g. a new `python-module-c/backend/data/` folder). This is the very first practical step — everything else in this guide depends on having that data locally and reproducibly, instead of "upload it by hand into Colab every time."

### 1.2 Cleaning

Step 4 defines small helper functions that clean the raw text:

- `clean_text` — collapses extra whitespace, strips the string.
- `parse_list` — many fields are stored as a string that *looks* like a list (`"['Python', 'SQL']"`); this turns it back into a real Python list.
- `normalize_skill` — the same skill can be written many ways ("ReactJS", "react.js", "React"). This maps all spellings of one skill down to a single canonical form, so the model doesn't treat "React" and "react.js" as two different skills.

**Why this matters:** if you skip this step, `"React"` and `"react.js"` count as two unrelated skills, and every match-ratio calculation downstream becomes wrong. Data cleaning is boring but it's often where the biggest quality gains hide — more than the choice of algorithm.

### 1.3 Feature engineering — deciding what the model gets to see

A **feature** is one measurable fact about a CV that might help predict its score. Step 6–7 turns each raw CV into 18 features (`feature_columns` in Step 10):

| Feature | What it measures |
|---|---|
| `target_role`, `experience_level` | categorical — which role, and seniority band |
| `cv_skills_count` | how many skills the CV lists |
| `required_skills_count`, `preferred_skills_count` | how many skills the *role* expects |
| `matched_required_count`, `matched_preferred_count` | overlap between CV skills and role skills |
| `missing_required_count`, `missing_preferred_count` | gap between CV skills and role skills |
| `required_match_ratio`, `preferred_match_ratio`, `project_match_ratio` | the above, as 0–1 ratios instead of raw counts |
| `experience_months`, `num_projects`, `has_projects`, `num_certificates`, `has_certificates` | CV content |
| `ats_quality_score` | a heuristic "is this CV well-formatted" score |

Two of these (`target_role`, `experience_level`) are **categorical** (text categories, not numbers), so they can't go into the model directly — Step 10 uses `OneHotEncoder` to turn each category into a set of 0/1 columns (e.g. `target_role_Data Analyst = 1, target_role_Frontend Developer = 0, …`). The rest are already numbers, so they pass through unchanged (`"num": "passthrough"`).

---

## 2. The label — what the model is actually learning to predict

This is the single most important thing to understand, and it's slightly hidden in your notebook.

### 2.1 How `final_score` is built

Step 7 does **not** load a real-world "this CV scored X" answer from anywhere. It **computes** the label itself, with a hand-written formula:

```
final_score = skill_score_component        (max 50)
            + project_score_component       (max 20)
            + experience_score_component    (max 15)
            + certificate_score_component   (max 10)
            + ats_score_component           (max 5)
```

...where each component is itself built directly from the same features listed in section 1.3 (`required_match_ratio`, `num_projects`, `experience_months`, `num_certificates`, `ats_quality_score`).

### 2.2 Why this matters for "algorithm selection"

Your supervisor asked you to try better algorithms because Random Forest "alone is insufficient." Here's the catch: **the label the model is trained on is a deterministic formula of the same inputs the model receives.** There is no real-world outcome in the loop (no actual recruiter decision, no actual hire/no-hire, no actual interview result) — the "ground truth" is arithmetic, not reality.

This explains the training result you got:

```
Mean Absolute Error: 1.22
R² Score: 0.9851
```

An R² of 0.985 means the model explains 98.5% of the variation in the label. That sounds great, but for a *formula* label, that's expected — any reasonably flexible model (Random Forest, Gradient Boosting, a plain linear regression) will get close to perfect, because it's reverse-engineering arithmetic, not learning judgment. **Swapping the algorithm alone will not meaningfully change this number**, because the ceiling is already almost reached by construction.

This isn't a mistake in your project — starting with a formula label is a completely normal and reasonable way to bootstrap a scoring model when you don't have real labelled outcomes yet. But it changes *what* "improve the model" should mean here. Two honest paths forward, and you'll likely want to mention this framing to your supervisor:

1. **Keep the formula label, but be explicit that "algorithm selection" here is really about robustness and interpretability, not chasing R².** A tuned ensemble can still be worth doing — it can generalize better to CVs that don't perfectly fit the formula's assumptions, and it gives you a legitimate comparison table to present (exactly what "Model Comparison" in the feedback asks for).
2. **Move toward a less circular label over time** — e.g. having recruiters/mentors rate a sample of real CVs, or using actual application outcomes if/when the platform collects them, and blending that in. This is a bigger, longer-term data engineering task, worth naming as a future direction rather than doing now.

For your immediate supervisor feedback, path 1 is the practical one. Section 4 below is built around it.

---

## 3. Core machine learning concepts, explained plainly

### 3.1 Train/test split

```python
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
```

You never let the model see 20% of the data during training. After training, you ask it to predict that hidden 20% and compare to the real answer. This simulates "how will it do on a CV it's never seen before?" If you skipped this and evaluated on the same data you trained on, the score would look artificially perfect — the model could partly be *memorizing* rather than *learning a pattern*. That gap between "training score" and "test score" is called **overfitting** when it's large.

`random_state=42` just means "shuffle the same way every time," so your results are reproducible.

### 3.2 What a Random Forest actually is

A single **decision tree** asks a sequence of yes/no questions about the features ("is `required_match_ratio` > 0.4? → is `experience_months` > 12? → …") and lands on a predicted number. One tree overfits easily — it can carve out very specific rules that only fit the training data.

A **Random Forest** trains many trees (`n_estimators=200` in your case means 200 trees), each on a slightly different random sample of the data and a random subset of features, then averages their predictions. Averaging cancels out each individual tree's quirks — this is called an **ensemble method** ("ensemble" = a group working together instead of one model alone).

### 3.3 Other ensembles — what "try ensemble/hybrid models" means concretely

Random Forest is *one kind* of ensemble (called **bagging** — training many trees in parallel on random samples). Your supervisor's feedback is really asking you to also try:

- **Gradient Boosting** (`GradientBoostingRegressor`, or the faster `HistGradientBoostingRegressor`) — trains trees *one after another*, where each new tree specifically tries to fix the errors the previous trees made. Often more accurate than Random Forest, at the cost of being slower to tune.
- **Extra Trees** (`ExtraTreesRegressor`) — like Random Forest but even more randomized; sometimes more stable on noisy data.
- **Stacking / Voting** — train several different model types (e.g. Random Forest + Gradient Boosting + a linear model), and combine their predictions, either by averaging (**voting**) or by training a small extra model that learns how to best combine them (**stacking**). This is what "hybrid model" usually means in a report like your supervisor's.

All of these exist in scikit-learn already (you don't need a new library) — see Section 4.

### 3.4 Hyperparameters and hyperparameter optimization

A **parameter** is something the model *learns* from data (e.g. which questions each tree ends up asking). A **hyperparameter** is something *you* choose before training starts, e.g.:

- `n_estimators` — how many trees.
- `max_depth` — how many questions deep a tree is allowed to go (deeper = can fit more complex patterns, but risks overfitting).
- `min_samples_leaf` — how few data points are allowed to sit in a tree's final answer group (higher = smoother, less overfit).
- `learning_rate` (for boosting only) — how big a correction each new tree is allowed to make.

Right now your notebook picks `n_estimators=200` and leaves everything else at scikit-learn's default — nothing was actually searched or compared. **Hyperparameter optimization** means trying many combinations and keeping the one that scores best on validation data, instead of guessing one value. The two standard scikit-learn tools:

- `GridSearchCV` — tries *every* combination you list. Thorough, but slow if you list many options.
- `RandomizedSearchCV` — tries a random sample of combinations from ranges you give it. Usually the better choice when there are many hyperparameters, because it covers more ground in the same time.

The `CV` in both names stands for **cross-validation**: instead of one train/test split, the data is split into (typically) 5 folds; each combination of hyperparameters is trained 5 times, each time holding out a different fold as the test set, and the 5 scores are averaged. This gives a much more reliable estimate than a single 80/20 split, because it isn't luck-dependent on which 20% happened to be held out.

### 3.5 Evaluation metrics — reading MAE and R²

- **MAE (Mean Absolute Error)** — on average, how far off is a prediction, in the same units as the score. `MAE = 1.22` means predictions are typically about 1.22 points off on a 0–100-ish scale. Easy to explain to a non-technical reader ("off by about 1 point on average").
- **R² (R-squared)** — a 0–1 (sometimes negative) number for "how much of the variation in the real answer does the model explain." 1.0 = perfect, 0.0 = no better than always guessing the average. As explained in Section 2.2, an R² this high (0.985) is mostly a signature of the label being formula-derived, not proof the model has learned something profound.

Other metrics worth adding when you compare models (Section 4):
- **RMSE (Root Mean Squared Error)** — like MAE, but squares errors before averaging, so it punishes big misses more than small ones.
- **Cross-validated MAE/R²** — the same metrics, but averaged over the 5 folds mentioned above, instead of one split. More trustworthy for the comparison table your supervisor wants.

### 3.6 Saving and loading a trained model

```python
joblib.dump(score_model, "cv_job_score_model.pkl")     # save
score_model = joblib.load(MODEL_PATH)                   # load, in app.py
```

`joblib` serializes the entire fitted pipeline (the one-hot encoder *and* the trained trees together) into one file. That's why `app.py` can call `score_model.predict(...)` directly on new data without repeating any training code — the `.pkl` file already contains everything the pipeline learned.

---

## 4. Concrete next steps for *this* project

In notebook-cell order, here's what to actually build, mapped to your supervisor's 4 feedback points:

1. **Get the raw data into the repo** (Section 1.1). Add `cleaned_cv_dataset.json` and `cleaned_job_posts_dataset.csv` under `python-module-c/backend/data/`, and turn the notebook into a plain `.py` script that reads local files instead of `google.colab.files.upload()` — so training becomes repeatable, not a manual Colab session. (`python-module-b/train_all.py` in this same repo is a working example of that pattern you can copy structurally.)

2. **Replace Step 10 with a model comparison** (feedback item: Algorithm Selection):
   - Build a small dictionary of candidate models: `RandomForestRegressor`, `GradientBoostingRegressor`, `ExtraTreesRegressor`, and a `VotingRegressor` combining them.
   - Run each through the *same* `ColumnTransformer` preprocessing you already have.
   - Score each with 5-fold cross-validated MAE and R² (Section 3.4–3.5), not just one train/test split.
   - Pick the best candidate, then run `RandomizedSearchCV` on it to tune hyperparameters (Section 3.4).
   - Keep a small table of all candidates' scores — that table *is* the "Model Comparison" your supervisor asked for.

3. **Add charts** (feedback item: Data Visualization) — with `matplotlib`/`seaborn` (already used in `python-module-b/train_all.py`, not yet installed in `python-module-c/backend/requirements.txt`):
   - A bar chart comparing MAE/R² across the candidate models from step 2.
   - A feature-importance chart from the winning model (`model.feature_importances_` for tree-based models) — this also gives you a "why this score" explanation for free, which was on the "beyond the feedback" list from the earlier review.
   - A predicted-vs-actual scatter plot on the test set, to visually show model fit.

4. **Prepare role-categorized demo CVs** (feedback item: Model Testing & Demo) — pick 4–5 real or representative CVs, one per role (Data Analyst, Frontend Developer, …), and show their per-role prediction breakdown rather than one averaged number.

5. **Relative evaluation** (feedback item: Relative Evaluation) doesn't need retraining at all — it's a lookup against previously stored scores (see the earlier review report for detail), so it can be built independently of steps 2–4.

---

## 5. Glossary — quick lookup

| Term | Plain meaning |
|---|---|
| Feature | An input number/category the model uses to make a prediction |
| Label / target (`y`) | The correct answer you're trying to predict |
| Feature engineering | Deciding and building what features to give the model |
| Train/test split | Hiding part of the data to test honestly after training |
| Overfitting | Model memorizes training data instead of learning a general pattern |
| Ensemble | Combining many models/trees so their average is better than any one |
| Bagging | Ensemble style: many models trained in parallel on random samples (Random Forest) |
| Boosting | Ensemble style: models trained one after another, each fixing the last one's errors |
| Stacking / Voting | Ensemble style: combining different model *types* together |
| Hyperparameter | A setting you choose before training (not learned from data) |
| Hyperparameter optimization | Systematically searching for the best hyperparameters |
| Cross-validation (CV) | Testing across several different train/test splits and averaging, for a more reliable score |
| MAE | Average size of prediction error, in the same units as the label |
| R² | Fraction of the label's variation the model explains (1.0 = perfect) |
| Pipeline | A saved bundle of preprocessing + model steps that run together |
| `.pkl` file | A saved (serialized) trained model, loaded later without retraining |

---

Once you've read this, the natural next move is picking one item from Section 4 to build first — step 2 (model comparison) is the one your supervisor explicitly asked for, so that's the reasonable place to start when you're ready to write code.
