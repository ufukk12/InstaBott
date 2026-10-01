"""
Instagram Takipçi / Takip Edilen Karşılaştırma Aracı
------------------------------------------------------
Amaç:
  - Hedef hesabın takipçi (followers) ve takip ettiği (following) listelerini
    private API üzerinden çeker.
  - Karşılaştırmayı set() veri yapısıyla yapar -> O(N) karmaşıklık.

Kullanım:
  python ig_follow_compare.py

Gerekli:
  pip install requests

UYARI:
  - Bu script Instagram'ın belgelenmemiş (private) endpoint'lerini kullanır.
  - Sadece kendi hesabınla / kendi sessionid'inle kullan.
  - Çok sık çalıştırırsan hesap geçici olarak kısıtlanabilir (rate limit).
"""

import time
import requests

BASE_URL = "https://i.instagram.com/api/v1"
PAGE_SIZE = 200          # Instagram'ın izin verdiği sayfa başı max kayıt
REQUEST_DELAY_SEC = 1.5  # Rate-limit'e yakalanmamak için istekler arası bekleme


def build_headers(sessionid: str) -> dict:
    """
    Instagram private API'nin kabul ettiği header seti.
    Mobil istemciyi taklit ediyoruz çünkü sadece bu şekilde sessionid ile
    kimlik doğrulaması geçerli oluyor.
    """
    return {
        "User-Agent": "Instagram 269.0.0.18.75 Android (30/11; 420dpi; 1080x2130)",
        "Cookie": f"sessionid={sessionid}",
        "X-IG-App-ID": "936619743392459",
        "Accept-Language": "en-US",
    }


def _fetch_paginated_list(user_id: str, headers: dict, endpoint: str) -> set:
    """
    Tek sorumluluk: verilen endpoint'ten (followers ya da following)
    sayfalanmış tüm kullanıcı adlarını çekip set olarak döner.

    max_id ile sayfalama yapılır; Instagram her sayfada bir sonraki
    sayfanın anahtarını (next_max_id) döner, o bitene kadar devam edilir.
    """
    usernames = set()
    max_id = ""

    while True:
        params = {"count": PAGE_SIZE}
        if max_id:
            params["max_id"] = max_id

        url = f"{BASE_URL}/friendships/{user_id}/{endpoint}/"
        response = requests.get(url, headers=headers, params=params, timeout=15)

        if response.status_code != 200:
            raise RuntimeError(
                f"{endpoint} çekilirken hata: HTTP {response.status_code} - {response.text[:200]}"
            )

        data = response.json()
        for user in data.get("users", []):
            usernames.add(user["username"])

        max_id = data.get("next_max_id")
        if not max_id:
            break  # Sayfalama bitti

        time.sleep(REQUEST_DELAY_SEC)

    return usernames


def fetch_followers(user_id: str, headers: dict) -> set:
    """Hedef hesabın takipçilerini döner."""
    return _fetch_paginated_list(user_id, headers, "followers")


def fetch_following(user_id: str, headers: dict) -> set:
    """Hedef hesabın takip ettiklerini döner."""
    return _fetch_paginated_list(user_id, headers, "following")


def get_user_id(username: str, headers: dict) -> str:
    """Kullanıcı adından numeric user_id'yi çözer (endpoint'ler id ister)."""
    url = f"{BASE_URL}/users/{username}/usernameinfo/"
    response = requests.get(url, headers=headers, timeout=15)
    if response.status_code != 200:
        raise RuntimeError(f"Kullanıcı bulunamadı: {username} - HTTP {response.status_code}")
    return response.json()["user"]["pk"]


def compare_follow_lists(followers: set, following: set) -> dict:
    """
    Hash map (dict) tabanlı karşılaştırma.

    Mantık:
      1) followers listesini bir dict'e (hash map) yükle -> O(N)
         Bu sayede "bu kullanıcı takipçi mi?" sorgusu O(1) olur.
      2) following listesi üzerinde TEK geçiş (single pass) yap -> O(M)
         Her kullanıcı için hash map'te var mı diye O(1) bak.

    Toplam karmaşıklık: O(N + M) yani O(N) (N ve M aynı büyüklük mertebesinde).
    Not: Python'da set de içten hash table kullanır; burada tercih ettiğin
    için işlemi açıkça dict ile yapıyoruz.
    """
    # 1. Adım: followers'ı hash map'e çevir (key: username, value: True)
    follower_map = {username: True for username in followers}

    not_following_back = []   # sen takip ediyorsun, o seni takip etmiyor
    mutual = []                # karşılıklı takipleşme

    # 2. Adım: following listesinde TEK geçiş, her sorgu O(1)
    for username in following:
        if username in follower_map:      # hash map lookup -> O(1)
            mutual.append(username)
            follower_map[username] = False  # işaretle: eşleşti (3. adımda ayıklamak için)
        else:
            not_following_back.append(username)

    # 3. Adım: follower_map'te hâlâ True olanlar = following'de hiç görülmeyenler
    # yani "seni takip ediyor ama sen onu takip etmiyorsun" -> tek geçişte toplanır
    you_dont_follow_back = [
        username for username, still_unmatched in follower_map.items()
        if still_unmatched
    ]

    return {
        "not_following_back": not_following_back,
        "you_dont_follow_back": you_dont_follow_back,
        "mutual": mutual,
    }


def main():
    sessionid = input("Sessionid: ").strip()
    target_username = input("Hedef kullanıcı adı: ").strip()

    headers = build_headers(sessionid)

    print("Kullanıcı ID çözümleniyor...")
    user_id = get_user_id(target_username, headers)

    print("Takipçiler çekiliyor...")
    followers = fetch_followers(user_id, headers)
    print(f"  -> {len(followers)} takipçi bulundu.")

    print("Takip edilenler çekiliyor...")
    following = fetch_following(user_id, headers)
    print(f"  -> {len(following)} takip edilen bulundu.")

    result = compare_follow_lists(followers, following)

    print("\n=== Seni takip etmeyenler (sen takip ediyorsun) ===")
    for u in sorted(result["not_following_back"]):
        print(f"  - {u}")

    print("\n=== Senin takip etmediklerin (onlar seni takip ediyor) ===")
    for u in sorted(result["you_dont_follow_back"]):
        print(f"  - {u}")

    print(f"\nToplam karşılıklı takipleşme: {len(result['mutual'])}")


if __name__ == "__main__":
    main()
