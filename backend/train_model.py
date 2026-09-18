# backend/train_model.py

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report
import joblib
import os

DATA_PATH = os.path.join("data", "phishing_email.csv")
MODEL_PATH = os.path.join("app", "phishing_model.pkl")


def main():
    # Load CSV: needs columns 'text_combined' and 'label'
    df = pd.read_csv(DATA_PATH)

    # Simple cleaning: drop rows with missing text
    df = df.dropna(subset=["text_combined", "label"])

    X = df["text_combined"].astype(str)
    y = df["label"].astype(int)

    # Train / test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42,
    )

    # Build pipeline: TF-IDF + Logistic Regression
    model = Pipeline([
        ("tfidf", TfidfVectorizer(
            stop_words="english",
            max_features=50000
        )),
        ("clf", LogisticRegression(
            max_iter=1000,
            n_jobs=-1
        ))
    ])

    print("Training model...")
    model.fit(X_train, y_train)

    print("Evaluating...")
    y_pred = model.predict(X_test)
    print(classification_report(y_test, y_pred))

    # Save model
    print(f"Saving model to {MODEL_PATH}...")
    joblib.dump(model, MODEL_PATH)
    print("Done.")


if __name__ == "__main__":
    main()