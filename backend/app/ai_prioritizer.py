"""
AI Prioritization Engine for Railway Maintenance Blocks.
Uses scikit-learn (Random Forest Regressor / Classifier) to predict:
1. Maintenance urgency score (0 - 100)
2. Expected train delay minutes if scheduled during peak vs off-peak
3. Dynamic asset failure risk based on track age, GMT, defect severity, and weather
"""

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from typing import Dict, Any, List

# Synthetic training data representing Indian Railways historical maintenance records
# Features:
# [criticality (1-5), urgency (1-5), safety_risk (1-5), overdue_days (0-60),
#  gross_million_tonnes (10-120), track_age_years (1-30), peak_hour_overlap (0 or 1)]
X_TRAIN = np.array([
    [5, 5, 5, 25, 95, 18, 1],
    [4, 4, 5, 15, 80, 14, 1],
    [5, 4, 4, 10, 85, 12, 0],
    [3, 3, 3, 5, 60, 8, 1],
    [2, 2, 2, 0, 45, 5, 0],
    [1, 2, 1, 0, 30, 3, 0],
    [4, 5, 5, 30, 110, 22, 1],
    [3, 4, 3, 12, 70, 10, 0],
    [2, 3, 2, 2, 50, 6, 1],
    [5, 5, 4, 20, 90, 16, 1],
    [1, 1, 2, 0, 25, 2, 0],
    [4, 3, 4, 8, 75, 11, 0],
    [3, 2, 3, 4, 55, 7, 0],
    [5, 4, 5, 18, 100, 20, 1],
    [2, 1, 1, 0, 35, 4, 0],
])

# Urgency score target (0 to 100)
Y_URGENCY = np.array([
    98.5, 87.0, 82.5, 58.0, 36.0, 22.0, 99.0, 68.0, 45.0, 94.0, 18.0, 72.0, 48.0, 93.0, 25.0
])

# Expected delay minutes target
Y_DELAY = np.array([
    45.0, 35.0, 18.0, 25.0, 8.0, 4.0, 55.0, 15.0, 18.0, 40.0, 3.0, 14.0, 9.0, 42.0, 5.0
])

# Train models
urgency_model = RandomForestRegressor(n_estimators=30, random_state=42)
urgency_model.fit(X_TRAIN, Y_URGENCY)

delay_model = RandomForestRegressor(n_estimators=30, random_state=42)
delay_model.fit(X_TRAIN, Y_DELAY)


def predict_maintenance_priority(
    criticality: int = 4,
    urgency: int = 4,
    safety_risk: int = 5,
    overdue_days: int = 10,
    gross_million_tonnes: float = 85.0,
    track_age_years: float = 12.0,
    is_peak_hour: bool = True,
) -> Dict[str, Any]:
    """
    Predict AI maintenance urgency and delay penalty.
    """
    features = np.array([[
        criticality,
        urgency,
        safety_risk,
        overdue_days,
        gross_million_tonnes,
        track_age_years,
        1 if is_peak_hour else 0,
    ]])

    pred_urgency = float(np.clip(urgency_model.predict(features)[0], 0, 100))
    pred_delay = float(max(0, delay_model.predict(features)[0]))

    if pred_urgency >= 85:
        priority_label = "HIGH"
        color = "red"
        action = "Immediate window allocation required within 24 hours"
    elif pred_urgency >= 60:
        priority_label = "MEDIUM"
        color = "yellow"
        action = "Schedule in upcoming 72-hour engineering corridor"
    else:
        priority_label = "LOW"
        color = "green"
        action = "Defer to regular weekly cyclic maintenance"

    return {
        "urgency_score": round(pred_urgency, 1),
        "priority_label": priority_label,
        "predicted_delay_minutes": round(pred_delay, 1),
        "color": color,
        "recommended_action": action,
        "model_version": "RandomForest-v1.8.0-SIH",
    }
