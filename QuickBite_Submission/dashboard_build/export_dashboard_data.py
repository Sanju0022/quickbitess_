"""Precompute everything the HTML dashboard can't cheaply recompute, and export model parameters.

Usage: python3 export_dashboard_data.py <deliver_dir> <out_json>
"""
import sys, os, json, inspect, warnings
import numpy as np
import pandas as pd
import joblib
from scipy.special import expit
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score, adjusted_rand_score, roc_auc_score
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_validate, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from mlxtend.frequent_patterns import apriori, association_rules
from mlxtend.preprocessing import TransactionEncoder

warnings.filterwarnings("ignore")
src, out = sys.argv[1], sys.argv[2]
RS = 42
diners = pd.read_csv(os.path.join(src, "diners.csv"))
orders = pd.read_csv(os.path.join(src, "orders.csv"))
M = joblib.load(os.path.join(src, "food_models.joblib"))
FEATURES = M["features"]
INPUTS = FEATURES + ["age", "total_spend"]
scaler, kmeans, clf, seg_names = M["scaler"], M["kmeans"], M["clf"], M["segment_names"]
Xs = scaler.transform(diners[FEATURES])
saved = kmeans.predict(Xs)
diners["cluster"] = saved
diners["segment"] = diners.cluster.map(seg_names)
SEG_ORDER = ["Budget students", "Premium foodies", "Families"]
name_to_cluster = {v: k for k, v in seg_names.items()}
D = {}

# ---------------------------------------------------------------- base data
D["meta"] = {"features": FEATURES, "inputs": INPUTS, "n": int(len(diners)), "segOrder": SEG_ORDER,
             "segNames": {str(k): v for k, v in seg_names.items()}, "reco": M["reco"],
             "nBaskets": int(orders.order_id.nunique())}
D["diners"] = {
    "id": diners.diner_id.tolist(), "age": diners.age.tolist(), "opm": diners.orders_per_month.tolist(),
    "aov": diners.avg_order_value.tolist(), "items": diners.avg_items_per_order.tolist(),
    "rec": diners.days_since_last_order.tolist(), "disc": diners.discount_rate.tolist(),
    "spend": diners.total_spend.tolist(), "y": diners.reordered.tolist(), "seg": [int(c) for c in saved]}

# ---------------------------------------------------------------- model parameters
lr = clf.named_steps["logisticregression"]; sc2 = clf.named_steps["standardscaler"]
D["model"] = {
    "segScaler": {"mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist()},
    "centers": kmeans.cluster_centers_.tolist(),
    "clf": {"mean": sc2.mean_.tolist(), "scale": sc2.scale_.tolist(), "coef": lr.coef_[0].tolist(),
            "intercept": float(lr.intercept_[0]), "classWeight": str(lr.class_weight)},
}
# verify the closed form we will use in JS
z = (diners[INPUTS].values - sc2.mean_) / sc2.scale_
logit = z @ lr.coef_[0] + lr.intercept_[0]
p_closed = 1.0 / (1.0 + np.exp(-logit))
p_sk = clf.predict_proba(diners[INPUTS])[:, 1]
print("closed-form vs sklearn max diff:", np.abs(p_closed - p_sk).max())
D["check"] = {"pSklearn": p_sk.tolist(), "segSklearn": [int(c) for c in saved]}

# ---------------------------------------------------------------- k-means fits k=2..8 and scan k=2..10
WORDS = {"orders_per_month": ("frequent", "infrequent"), "avg_order_value": ("high spend", "low spend"),
         "avg_items_per_order": ("big baskets", "small baskets"), "days_since_last_order": ("lapsed", "recent"),
         "discount_rate": ("discount-heavy", "full-price")}
SLOT = {"Families": 0, "Premium foodies": 1, "Budget students": 2}
kfits, kscan = {}, []
for k in range(2, 11):
    km = KMeans(n_clusters=k, n_init=10, random_state=RS).fit(Xs)
    sil = silhouette_score(Xs, km.labels_)
    kscan.append({"k": k, "inertia": float(km.inertia_), "sil": float(sil)})
    if k > 8:
        continue
    labels = km.labels_
    # order clusters by size (desc) then by first centre coordinate, for stable display order
    sizes = np.bincount(labels, minlength=k)
    # parent k=3 segment = majority overlap
    parents, overlap = [], []
    for c in range(k):
        vc = diners.segment[labels == c].value_counts()
        parents.append(vc.index[0]); overlap.append(int(vc.iloc[0]))
    # colour slots: the cluster with the largest overlap with each parent keeps the parent's colour
    slots = [None] * k
    for seg in SEG_ORDER:
        cand = [c for c in range(k) if parents[c] == seg]
        if cand:
            best = max(cand, key=lambda c: overlap[c]); slots[best] = SLOT[seg]
    nxt = 3
    for c in sorted(range(k), key=lambda c: -sizes[c]):
        if slots[c] is None:
            slots[c] = nxt; nxt += 1
    centers_raw = scaler.inverse_transform(km.cluster_centers_)
    names, desc = [], []
    for c in range(k):
        zc = km.cluster_centers_[c]
        top = np.argsort(-np.abs(zc))[:2]
        d = " · ".join(WORDS[FEATURES[i]][0 if zc[i] > 0 else 1] for i in top)
        desc.append(d)
    if k == 3:
        nm = {c: seg_names[c] for c in range(3)}
        assert (labels == saved).all(), "k=3 fit differs from saved model"
        names = [nm[c] for c in range(3)]
    else:
        names = [f"Group {i+1}" for i in range(k)]
        # number groups in display order (by colour slot)
        order_ = sorted(range(k), key=lambda c: slots[c])
        names = [None] * k
        for i, c in enumerate(order_):
            names[c] = f"Group {i+1}"
    kfits[str(k)] = {"labels": [int(v) for v in labels], "centers": km.cluster_centers_.round(6).tolist(),
                     "centersRaw": centers_raw.round(4).tolist(), "sizes": sizes.tolist(), "slots": slots,
                     "names": names, "desc": desc, "parent": parents, "parentShare": [o / s for o, s in zip(overlap, sizes)],
                     "sil": float(sil), "inertia": float(km.inertia_),
                     "reorder": [float(diners.reordered[labels == c].mean()) for c in range(k)]}
D["kfits"], D["kscan"] = kfits, kscan

# ---------------------------------------------------------------- PCA
pca = PCA(n_components=3, random_state=RS).fit(Xs)
D["pca"] = {"components": pca.components_.tolist(), "mean": pca.mean_.tolist(),
            "evr": pca.explained_variance_ratio_.tolist(),
            "coords": np.round(pca.transform(Xs), 4).tolist()}

# ---------------------------------------------------------------- baskets and rules
items = sorted(orders.item.unique())
iidx = {it: i for i, it in enumerate(items)}
bk = orders.groupby("order_id", sort=True).agg(diner=("diner_id", "first"), items=("item", list))
did = {d: i for i, d in enumerate(diners.diner_id)}
D["baskets"] = {"items": items, "list": [sorted(iidx[i] for i in its) for its in bk["items"]],
                "diner": [did[d] for d in bk.diner]}


def assoc(freq, n):
    if "num_itemsets" in inspect.signature(association_rules).parameters:
        return association_rules(freq, metric="lift", min_threshold=0.0, num_itemsets=n)
    return association_rules(freq, metric="lift", min_threshold=0.0)


def rules_for(rows, ms=0.01):
    b = rows.groupby("order_id")["item"].apply(list)
    te = TransactionEncoder(); oh = pd.DataFrame(te.fit_transform(b), columns=te.columns_)
    fi = apriori(oh, min_support=ms, use_colnames=True)
    r = assoc(fi, len(oh))
    n = len(oh)
    outl = []
    for row in r.itertuples():
        outl.append({"a": sorted(iidx[i] for i in row.antecedents), "c": sorted(iidx[i] for i in row.consequents),
                     "s": float(row.support), "conf": float(row.confidence), "lift": float(row.lift),
                     "nA": int(round(row._3 * n)), "nC": int(round(row._4 * n)), "nAC": int(round(row.support * n))})
    return {"n": n, "rules": outl}


cols = list(assoc(apriori(pd.DataFrame({"x": [True, True], "y": [True, False]}), min_support=0.5, use_colnames=True), 2).columns)
assert cols[2] == "antecedent support" and cols[3] == "consequent support", cols
seg_orders = orders.merge(diners[["diner_id", "segment"]], on="diner_id")
D["rules"] = {"Overall": rules_for(orders)}
for s in SEG_ORDER:
    D["rules"][s] = rules_for(seg_orders[seg_orders.segment == s])
print({k: len(v["rules"]) for k, v in D["rules"].items()})

# bundles: top rule by lift inside each segment among rules with support >= 10% (deduped), items = union
bundles = {}
for s in SEG_ORDER:
    rr = [r for r in D["rules"][s]["rules"] if r["s"] >= 0.10 and r["lift"] > 1]
    rr.sort(key=lambda r: (-round(r["lift"], 10), -r["conf"], -r["s"]))
    best = rr[0]
    bundles[s] = {"items": [items[i] for i in sorted(set(best["a"]) | set(best["c"]))],
                  "rule": {"a": [items[i] for i in best["a"]], "c": [items[i] for i in best["c"]],
                           "s": best["s"], "conf": best["conf"], "lift": best["lift"]}}
D["bundles"] = bundles
print(bundles)

# ---------------------------------------------------------------- classifier runs: 5 models x 6 test sizes
MODELS = {
    "lr": ("Logistic regression", lambda: make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))),
    "lrb": ("Logistic regression (balanced)", lambda: make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, class_weight="balanced"))),
    "dt": ("Decision tree", lambda: DecisionTreeClassifier(max_depth=4, random_state=RS)),
    "rf": ("Random forest", lambda: RandomForestClassifier(n_estimators=300, random_state=RS)),
    "gb": ("Gradient boosting", lambda: GradientBoostingClassifier(random_state=RS)),
}
SIZES = [0.15, 0.20, 0.25, 0.30, 0.35, 0.40]
X = diners[INPUTS]; y = diners.reordered
cv5 = StratifiedKFold(5, shuffle=True, random_state=RS)
runs = {}
for ts in SIZES:
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=ts, stratify=y, random_state=RS)
    for key, (label, make) in MODELS.items():
        m = make()
        cvr = cross_validate(m, Xtr, ytr, cv=cv5, scoring=["accuracy", "roc_auc"])
        m.fit(Xtr, ytr)
        p = m.predict_proba(Xte)[:, 1]
        pred = m.predict(Xte)
        assert ((p > 0.5).astype(int) == pred).all() or key in ("dt", "rf", "gb"), key
        if key in ("lr", "lrb"):
            imp = m.named_steps["logisticregression"].coef_[0].tolist(); kind = "coef"
        else:
            imp = m.feature_importances_.tolist(); kind = "importance"
        runs[f"{key}|{ts:.2f}"] = {"test": [int(i) for i in Xte.index], "p": p.tolist(), "pred": pred.tolist(),
                                   "cvAcc": float(cvr["test_accuracy"].mean()), "cvAuc": float(cvr["test_roc_auc"].mean()),
                                   "auc": float(roc_auc_score(yte, p)), "imp": imp, "impKind": kind}
D["models"] = {"keys": list(MODELS), "labels": {k: v[0] for k, v in MODELS.items()}, "sizes": SIZES, "runs": runs}
r = runs["lrb|0.25"]
print("check lrb|0.25 acc", np.mean(np.array(r["pred"]) == y.loc[r["test"]].values))

# ---------------------------------------------------------------- F1
stump = DecisionTreeClassifier(max_depth=1, random_state=RS).fit(diners[["days_since_last_order"]], y)
seg_d = pd.get_dummies(diners.segment, prefix="seg").astype(int)
Xrs = pd.concat([diners[["days_since_last_order"]], seg_d], axis=1)
lrp = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))
lrb = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, class_weight="balanced"))
cands = [("Recency rule (1 cut-off)", DecisionTreeClassifier(max_depth=1, random_state=RS), diners[["days_since_last_order"]], "rule"),
         ("Full model, 7 inputs (balanced LR, chosen)", lrb, diners[INPUTS], "full"),
         ("Full model, 7 inputs (plain LR)", lrp, diners[INPUTS], "full"),
         ("Recency + segment (plain LR)", lrp, Xrs, "two"),
         ("Recency + segment (balanced LR)", lrb, Xrs, "two")]
f1cv = [{"name": n, "kind": kd, "acc": float(cross_val_score(m, Xc, y, cv=cv5).mean()),
         "auc": float(cross_val_score(m, Xc, y, cv=cv5, scoring="roc_auc").mean())} for n, m, Xc, kd in cands]
auc1 = []
for f in INPUTS:
    a = roc_auc_score(y, diners[f]); auc1.append({"f": f, "auc": float(max(a, 1 - a)), "up": bool(a > 0.5)})
auc1.sort(key=lambda d: -d["auc"])
D["f1"] = {"cut": float(stump.tree_.threshold[0]), "cv": f1cv, "auc1": auc1}
print(D["f1"]["cut"], [(d["name"], round(d["acc"], 4)) for d in f1cv])

# ---------------------------------------------------------------- F5
f5 = []
for drop in [None] + FEATURES:
    feats = [f for f in FEATURES if f != drop]
    Xd = StandardScaler().fit_transform(diners[feats])
    kd = KMeans(n_clusters=3, n_init=10, random_state=RS).fit(Xd)
    ct = pd.crosstab(diners.segment, kd.labels_).reindex(SEG_ORDER).fillna(0).astype(int)
    f5.append({"dropped": drop, "sil": float(silhouette_score(Xd, kd.labels_)),
               "ari": float(adjusted_rand_score(saved, kd.labels_)), "crosstab": ct.values.tolist(),
               "cols": [int(c) for c in ct.columns]})
D["f5"] = f5

# ---------------------------------------------------------------- personas (same as the notebook)
D["personas"] = [
    {"name": "Aisha, uni student", "p": dict(age=21, orders_per_month=14, avg_order_value=40, avg_items_per_order=2, days_since_last_order=3, discount_rate=0.70, total_spend=560)},
    {"name": "The Khans, family of five", "p": dict(age=41, orders_per_month=4, avg_order_value=180, avg_items_per_order=6, days_since_last_order=20, discount_rate=0.30, total_spend=700)},
    {"name": "Omar, busy consultant", "p": dict(age=33, orders_per_month=9, avg_order_value=100, avg_items_per_order=3, days_since_last_order=8, discount_rate=0.10, total_spend=900)},
    {"name": "Lena, foodie drifting off", "p": dict(age=34, orders_per_month=8, avg_order_value=105, avg_items_per_order=3, days_since_last_order=16, discount_rate=0.08, total_spend=850)},
    {"name": "The Raos, regular family", "p": dict(age=38, orders_per_month=5, avg_order_value=160, avg_items_per_order=6, days_since_last_order=6, discount_rate=0.25, total_spend=800)},
]
for pr in D["personas"]:
    row = pd.DataFrame([pr["p"]])
    pr["skSeg"] = seg_names[int(kmeans.predict(scaler.transform(row[FEATURES]))[0])]
    pr["skProb"] = float(clf.predict_proba(row[INPUTS])[0][1])

with open(out, "w") as fh:
    json.dump(D, fh, separators=(",", ":"))
print("wrote", out, os.path.getsize(out) // 1024, "KB")
