# Mekanik dönüşüm: Objektif ↔ Film makarası — storyboard

Durum: **Onaylandı** (28 Eylül 2026). Bütçe kararı: **A** — 02'ye giriş sade iris.

## Fikir

Objektif, İşler (04) sahnesine geçerken parçalarına ayrılıp bir **35 mm film
makarasına** dönüşür; proje kartları bu makaranın etrafında döner. İletişim
(05) sahnesinde aynı dönüşüm **tersine** oynar: makara katlanıp objektife
döner ve diyafram kapanır. Film başladığı objeyle biter.

Tek bir animasyon klibi (`LensToReel`, 0 → 1) iki yönde de kullanılır.

## Hedef obje: makara (Blender ölçüleri, ön = −Y, kameraya bakar)

| Parça | Ölçü |
|---|---|
| Ön disk (jant) | halka, iç r 1.70 – dış r 2.00, kalınlık 0.04, y = −0.26 |
| Kollar | 9 düz kol, göbekten (r 0.38) janta (r 1.72) uzanır, genişlik 0.14; aralarındaki boşluklardan film rulosu görünür |
| Arka disk | dolu disk r 0.38 – 2.00, kalınlık 0.04, y = +0.26 |
| Film rulosu | silindir, iç r 0.40 – dış r 1.55, y −0.22 … +0.22, koyu ve katmanlı kenar |
| Göbek | krom silindir r 0.20 – 0.38, üç sürücü dişi |
| Göbek kapağı | küçük cam kubbe, r 0.30 |

Makara objektiften büyüktür (r 2.0 ↔ 1.45); web tarafı dönüşüm sırasında
ölçeği ~0.75'e indirir, ekranda boyut sıçraması olmaz.

## Parça eşleşmesi

| Objektif parçası | → Makarada | Nasıl |
|---|---|---|
| 9 diyafram bıçağı | 9 kol | tamamen açılır → merkeze doğru döner → hilal şekli düzleşir (shape key) |
| Ön halka (`Hero_Barrel`) | ön disk / jant | incelir ve genişler (profil shape key) |
| Arka gövde (`Hero_Body`) | arka disk | incelir ve genişler (profil shape key) |
| Tırtıklı odak halkası (`Hero_Grip`) | film rulosu | tırtıklar düzleşir, içe doğru kalınlaşır (shape key) |
| Krom bayonet (`Hero_Mount`) + 3 tırnak | göbek + 3 sürücü dişi | küçülüp merkeze kayar |
| Ön cam (`Hero_Glass`) | göbek kapağı | küçülüp öne gelir |
| Ön kazıma yazı | jant üzerindeki yazı | jantla birlikte genişler (okunur kalır) |
| Altın halka | jantın dış kenarı | genişler |
| Diyafram halkası, f-değerleri, alüminyum bant, kırmızı nokta | — | film rulosunun içine çekilip kaybolur |
| Arka cam, iç gövde duvarı | — | küçülüp kaybolur |

## Zamanlama (klip içinde, 0 → 1)

| Aralık | Ne oluyor |
|---|---|
| 0.00 – 0.12 | diyafram tamamen açılır (web tarafı), kamera hafifçe geri çekilir |
| 0.10 – 0.35 | **teleskop:** halkalar eksen boyunca ayrılır — ön halka öne, arka gövde arkaya; iç parçalar görünür olur |
| 0.30 – 0.60 | **yeniden biçimlenme:** halkalar disklere, odak halkası film rulosuna, bayonet göbeğe, cam kapağa dönüşür; yok olacak parçalar ruloya çekilir |
| 0.45 – 0.80 | **kollar:** bıçaklar merkeze döner, düzleşir, janta kilitlenir |
| 0.75 – 1.00 | **kapanış:** ayrılan parçalar tekrar birleşir, makara 1/4 tur döner, sürücü dişleri yerine oturur |

Her aşama bir öncekiyle biraz örtüşür; hiçbir an "donmuş" durmaz.

## Web tarafı

- İşler sahnesine giriş: perde yok, **dönüşümün kendisi geçiştir**. Dünya
  rengi (gece mavisi) dönüşüm boyunca yavaşça değişir (`oneshot` ile aynı mantık).
- Dönüşüm ~1.2 ekranlık kaydırma sürer; hız sınırı onu da korur (sert
  kaydırmada ≥ ~1.8 sn ekranda kalır).
- Proje kartları makaranın etrafında, dönüşüm bitince belirir; makara kartlarla
  aynı yönde döner.
- İletişim sahnesine giriş: klip 1 → 0 oynar, sonra diyafram kapanır.
- Metin dönüşüm sırasında görünmez (skill kuralı).

## Teknik sözleşme

- Her parça iki hali için **aynı nokta sayısıyla** üretilir (lathe profilleri
  aynı sayıda noktaya sahip, bıçak ve kol aynı dış hat parametresiyle).
  Parça başına bir shape key: `Reel`.
- Bıçak hiyerarşisi: `Hero_BladePivot_NN` (klip bunu taşır) → `Hero_Blade_NN`
  (web diyaframı açmak için bunu döndürür). Dönüşüm sırasında web `open = 1`
  tutar; klip bu değere göre hazırlanır.
- Klip Blender'da Python ile keyframe'lenir, glTF'e `LensToReel` adıyla
  aktarılır; web `AnimationMixer.setTime()` ile kaydırmaya bağlar.
- Kontrol: Blender'dan 12 karelik storyboard görüntüsü (her aşama), web'de
  ileri/geri kaydırma, sert kaydırma, mobil ve performans testi.
- Bütçe: model ≤ 150k üçgen, ≤ 600 KB.

## Açık karar: geçiş bütçesi

Dönüşüm bir **imza an**. Şu anki geçişlerle film şöyle olur:

01 → 02 **portal** · 02 → 03 **ışık patlaması** · 03 → 04 **dönüşüm** · 04 → 05 **ters dönüşüm**

Bu 4 imza an demek; en gösterişli ton (`spectacle`) bile 3'e izin veriyor ve
imza anların arka arkaya gelmemesini istiyor. Seçenekler:

- **A (önerilen):** 02'ye girişteki portal → sade **iris** (aynı daire, parlamasız).
  Kalan: ışık patlaması · dönüşüm · ters dönüşüm → 3 imza, `spectacle` ton.
  Işık patlaması ile dönüşüm arka arkaya olur ama biri perde, biri obje
  hareketi — farklı hissettirir; kabul edilebilir bir istisna.
- **B:** Portal kalsın, ışık patlaması → sade **dip** (renge kararma).
- **C:** Hepsi kalsın; bütçe uyarısını bilinçli olarak yok sayarız.

## Aşama 2 — Blender (tamamlandı, onay bekliyor)

- Model: `tools/hero.py` → tek klip `LensToReel` (120 kare, 5 sn), 42.5k üçgen,
  Meshopt ile ~355 KB (`tools/build-hero.sh`).
- İnceleme: kareler ve video isteğe bağlı üretilir, repoda tutulmaz:
  `tools/hero.py -- --out /tmp/x.glb --frames /tmp/frames [--front]` ve
  `--video /tmp/lens-to-reel.mp4`.
- Bıçak → kol eşleşmesi en kısa köşe yoluna göre otomatik seçilir
  (`best_spoke_match`); 9 katlı simetri her üretimde doğrulanır (assert).
- Storyboard'dan farklar: bıçaklar kol olmadan önce objektifin önüne çıkar ve
  her biri kendi mafsalı etrafında döner (merkezde yığılmayı önlemek için);
  film rulosunun kapaklarında sarılı film katmanlarını andıran oluklar var.
- Web'deki site henüz eski (dönüşümsüz) objektifi kullanıyor; `build-hero.sh`
  Aşama 3'te, web tarafı Meshopt ve yeni bıçak hiyerarşisine hazır olunca çalıştırılacak.
