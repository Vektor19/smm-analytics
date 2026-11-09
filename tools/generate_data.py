"""Generates deterministic mock data for the SMM Analytics dashboard.

The three JSON files mirror the future database tables (see db/schema.sql):
  data/accounts.json     -> Accounts
  data/daily_stats.json  -> DailyStats  (one row per account per day)
  data/posts.json        -> Posts

Daily engagement is derived from the posts (each post earns most of its reactions in its first days),
so the charts, KPIs and the top-posts table stay consistent with each other.

Usage: python tools/generate_data.py
"""
import json
import math
import os
import random
from datetime import date, datetime, timedelta

random.seed(2026)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")
END = date(2026, 11, 8)
DAYS = 180
START = END - timedelta(days=DAYS - 1)

ACCOUNTS = [
    # id, platform, handle, start followers, end followers, posts per week, reach per post (share of followers), base ER %
    dict(id="ig", platform="Instagram", handle="@zerno.coffee", name="Кавʼярня «Зерно»", color="#E1306C",
         start=12400, end=15900, per_week=4, reach=0.42, er=4.1, types=["Reels", "Фото", "Карусель", "Stories"]),
    dict(id="tt", platform="TikTok", handle="@zerno.coffee", name="Кавʼярня «Зерно»", color="#13B8B4",
         start=3100, end=11800, per_week=5, reach=1.6, er=7.4, types=["Відео"]),
    dict(id="fb", platform="Facebook", handle="Zerno Coffee", name="Кавʼярня «Зерно»", color="#1877F2",
         start=8200, end=8450, per_week=3, reach=0.18, er=1.3, types=["Фото", "Посилання", "Відео"]),
    dict(id="yt", platform="YouTube", handle="@ZernoCoffee", name="Кавʼярня «Зерно»", color="#FF0033",
         start=1180, end=2140, per_week=1, reach=0.9, er=5.2, types=["Відео", "Shorts"]),
]

TOPICS = [
    "Як ми обсмажуємо зерно: від мішка до чашки", "Новий сезонний лате з гарбузом", "Бариста Оля готує флет-вайт за 60 секунд",
    "5 помилок, через які домашня кава гірчить", "Знижка −20% на фільтр-каву до кінця тижня", "Закулісся: ранок у кавʼярні о 6:30",
    "Тест: еспресо з трьох різних зерен", "Відповідаємо на ваші запитання про каву", "Латте-арт: сердечко, тюльпан, лебідь",
    "Відкриваємо другу локацію на Подолі!", "Колд брю: рецепт для дому", "Розіграш: пачка кави за коментар",
    "Звідки наша Ефіопія: історія ферми", "Чому V60 — найкращий старт для новачка", "Відгуки гостей за тиждень",
    "Кава і десерт: ідеальні пари", "Як обрати кавомолку до 3000 грн", "Новинка: матча-тонік", "Наш бариста — чемпіон міста",
    "Робочий день з ноутбуком: де розетки", "Вечір живої музики у пʼятницю", "Чим арабіка відрізняється від робусти",
    "День народження кавʼярні — 3 роки!", "Капучино vs флет-вайт: у чому різниця",
]


def jitter(x, pct):
    return x * (1 + random.uniform(-pct, pct))


def followers_curve(acc, i):
    """S-curve-ish growth from start to end with mild noise."""
    t = i / (DAYS - 1)
    shaped = (1 - math.cos(math.pi * t)) / 2 if acc["id"] != "tt" else t ** 1.6
    return acc["start"] + (acc["end"] - acc["start"]) * shaped


def make_posts():
    posts, pid = [], 1
    for acc in ACCOUNTS:
        d = START
        while d <= END:
            if random.random() < acc["per_week"] / 7:
                i = (d - START).days
                followers = followers_curve(acc, i)
                viral = random.random() < (0.07 if acc["id"] == "tt" else 0.04)
                factor = random.uniform(2.6, 5.5) if viral else random.lognormvariate(0, 0.35)
                weekend = d.weekday() >= 5
                reach = int(followers * acc["reach"] * factor * (1.12 if weekend else 1.0))
                er = jitter(acc["er"], 0.35) * (1.25 if viral else 1.0)
                engagements = followers * er / 100 * factor ** 0.5
                likes = int(engagements * random.uniform(0.74, 0.84))
                comments = int(engagements * random.uniform(0.04, 0.09))
                shares = int(engagements * random.uniform(0.04, 0.1))
                saves = max(0, int(engagements) - likes - comments - shares)
                hour = random.choice([8, 9, 12, 13, 18, 19, 20, 21])
                ptype = random.choice(acc["types"])
                posts.append(dict(
                    id=pid, accountId=acc["id"], platform=acc["platform"], type=ptype,
                    title=random.choice(TOPICS),
                    publishedAt=datetime(d.year, d.month, d.day, hour, random.choice([0, 15, 30, 45])).isoformat(),
                    followersAtPublish=int(followers),
                    reach=reach, impressions=int(reach * random.uniform(1.15, 1.6)),
                    likes=likes, comments=comments, shares=shares, saves=saves,
                    videoViews=int(reach * random.uniform(1.1, 1.9)) if ptype in ("Reels", "Відео", "Shorts") else None,
                ))
                pid += 1
            d += timedelta(days=1)
    posts.sort(key=lambda p: p["publishedAt"])
    for n, p in enumerate(posts, 1):
        p["id"] = n
    return posts


def make_daily(posts):
    # A post collects 55% / 22% / 13% / 10% of its reach and reactions over its first four days.
    spread = [0.55, 0.22, 0.13, 0.10]
    keys = ["reach", "impressions", "likes", "comments", "shares", "saves"]
    acc_by_id = {a["id"]: a for a in ACCOUNTS}
    bucket = {(a["id"], i): {k: 0.0 for k in keys} for a in ACCOUNTS for i in range(DAYS)}
    for p in posts:
        i0 = (date.fromisoformat(p["publishedAt"][:10]) - START).days
        for k, share in enumerate(spread):
            if i0 + k < DAYS:
                for key in keys:
                    bucket[(p["accountId"], i0 + k)][key] += p[key] * share

    rows = []
    for a in ACCOUNTS:
        prev = None
        for i in range(DAYS):
            d = START + timedelta(days=i)
            b = bucket[(a["id"], i)]
            followers = int(jitter(followers_curve(a, i), 0.002))
            if prev is not None and followers < prev - 15:
                followers = prev - random.randint(0, 15)
            # Organic baseline: profile visits, old posts, search.
            base_reach = followers_curve(a, i) * a["reach"] * 0.08
            reach = int(b["reach"] + jitter(base_reach, 0.3))
            likes = int(b["likes"] + reach * 0.004)
            net = 0 if prev is None else followers - prev
            unfollows = random.randint(2, max(3, int(followers * 0.0009)))
            rows.append(dict(
                date=d.isoformat(), accountId=a["id"], platform=a["platform"],
                followers=followers, newFollowers=max(0, net) + unfollows, unfollows=unfollows,
                reach=reach, impressions=int(b["impressions"] + reach * 1.2 - b["reach"] * 1.2 + base_reach * 0.3),
                likes=likes, comments=int(b["comments"]), shares=int(b["shares"]), saves=int(b["saves"]),
                profileVisits=int(reach * random.uniform(0.02, 0.05)),
            ))
            prev = followers
    return rows


def main():
    os.makedirs(OUT, exist_ok=True)
    posts = make_posts()
    daily = make_daily(posts)
    accounts = [dict(id=a["id"], platform=a["platform"], handle=a["handle"], name=a["name"], color=a["color"])
                for a in ACCOUNTS]
    meta = dict(generatedAt=END.isoformat(), periodStart=START.isoformat(), periodEnd=END.isoformat(),
                note="Мок-дані для MVP. Структура відповідає таблицям db/schema.sql.")
    for name, payload in [("accounts", dict(meta=meta, items=accounts)),
                          ("daily_stats", dict(meta=meta, items=daily)),
                          ("posts", dict(meta=meta, items=posts))]:
        with open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"accounts={len(accounts)} daily_stats={len(daily)} posts={len(posts)}")


if __name__ == "__main__":
    main()
