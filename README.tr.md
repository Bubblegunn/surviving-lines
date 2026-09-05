# surviving-lines

[English](README.md) | Türkçe

Bir git ref'inde hâlâ yaşayan kodu kimin yazdığını, commit payının yanında ölçer.

Commit sayısı etkinliği ölçer. `git blame` ise sonraki her yeniden düzenlemeden sağ çıkanı
ölçer. İki sayı sanıldığından daha sık ayrışır ve ilginç olan genellikle aradaki boşluktur:
blame payı commit payının üstünde olan biri başkalarının kodunu değiştiren kodu yazmıştır;
altında olan biri ise değiştirilen kodu yazmıştır.

Tek dosya, bağımlılık yok, Node 20 ya da üstü, `git`'in okuyabildiği her depo.

```
npx surviving-lines --sample 5 --include '**/*.ts' --exclude '**/*.test.ts'
```

```
ref HEAD  ·  files 50/203 sampled (1 in 5)  ·  14,722 of 59,049 lines attributed
git blame -w -M  ·  commits 339, merges excluded

author            lines   share  commits   share
------------------------------------------------
Colin Francis     7,718   52.4%       61   18.0%
Brace Sproul      3,314   22.5%       61   18.0%
Greg Land           356    2.4%        9    2.7%
…

What this cannot show: quality of the lines, review work, design done in documents,
or code that was deleted on purpose. Share of surviving lines is about survivorship, not merit.
```

Bu çalıştırma [langchain-ai/openwiki](https://github.com/langchain-ai/openwiki) deposunun
`1e6d54c` sürümünde (4 Eylül 2026) yapıldı ve 0,3 saniye sürdü. Aynı commit payına sahip iki
yazar, hâlâ orada duran kodun çok farklı paylarını tutuyor.

## Neden örnekleme

`git blame` büyük depolarda yavaştır çünkü her dosya için geçmişi dolaşır. Deterministik bir
örnek çalıştırmayı ucuzlatır ve daha önemlisi yeniden üretilebilir kılar: dosya kümesi her
yolun hash'i (FNV-1a) ve isteğe bağlı bir tuz ile seçilir, böylece depoya ve aynı komuta sahip
herkes aynı dosyaları ve aynı sayıları alır. Farklı bir örnek çekmek ve payların tuttuğunu
görmek için tuzu değiştirin.

`--sample 1` (varsayılan) her dosyayı blame'ler. 60 bin satırlık bir TypeScript deposunda bu
hâlâ bir dakikanın epey altındadır.

## Örnek nasıl seçilir

Her yol hash'lenir; hash `n`'e tam bölünüyorsa dosya örneğe girer:

```
h     = FNV-1a-32( tuz + "\0" + yol )       # 32 bit, UTF-16 kod birimleri üzerinde
girer = (h mod n) == 0                       # --sample n; n = 1 her dosyayı tutar
```

Ayırıcı bir NUL baytıdır, bu yüzden bir tuz bir yol önekiyle çakışamaz. FNV-1a tam sayı
aritmetiğidir (`Math.imul`, işaretsiz kaydırma); rastgelelik, dosya içeriği ve zaman damgası
yoktur, git yolları her zaman ileri eğik çizgi kullanır. Bu yüzden aynı komut Node 20, 22
veya 24'te, her işletim sisteminde aynı dosyaları seçer. Beklenen örnek `n` dosyada birdir;
kesin sayı yollara bağlıdır, çıktının 40 varsaymak yerine `files 50/203 sampled` yazması
bundandır.

Çalışılmış örnek, [langchain-ai/openwiki](https://github.com/langchain-ai/openwiki) `1e6d54c`,
`--sample 5 --include '**/*.ts' --exclude '**/*.test.ts'` (filtrelerden sonra 203 dosya):

| yol | `"\0" + yol` FNV-1a değeri | mod 5 | örnekte |
|---|---|---|---|
| `evals/ledger/benchmark/benchmark.ts` | 1128513045 | 0 | evet |
| `src/index.ts` | 1807104411 | 1 | hayır |

`--seed second` ile ilk yol 646834445'e hash'lenir, yine 0 mod 5; toplamda farklı 45 dosya
seçilir. Aynı commit üzerinde üç tuz:

| tuz | dosya | atfedilen satır | Colin Francis | Brace Sproul |
|---|---|---|---|---|
| (yok) | 50/203 | 59.049'un 14.722'si | %52,4 | %22,5 |
| `second` | 45/203 | 59.049'un 12.609'u | %59,5 | %24,4 |
| `third` | 47/203 | 59.049'un 13.071'i | %56,1 | %22,5 |

En üstteki yazar için yaklaşık yedi puanlık bu yayılma, bu depoda 5'te 1 örneğin değeridir:
sıralama ve commit payıyla arasındaki fark (ikisi için de %18,0) her tuzda tutar, ikinci
ondalık tutmaz. Pay, deponun değil örneklenen satırların payıdır ve örnek dosya bazında
seçildiği için tek bir büyük dosya payı oynatabilir. Tek bir sayı önemliyse `--sample 1`
çalıştırın; örneklenmiş bir sayıyı alıntılarken `--json` çıktısındaki `sample.every`,
`sample.seed`, `filesSampled` ve `linesAttributed` alanlarını yanına yazın; tablonun ilk
satırı zaten bunları basar.

## Ne sayar

- `lines` sütunu, örneklenen dosyalarda, `git blame -w -M`'nin gördüğü hâliyle son
  değişikliği yazara ait olan satırları sayar. `-w` yalnızca boşluk değişikliklerini yok sayar, `-M` dosya
  içinde taşınan satırları izler; böylece yeniden biçimlendirme ve yer değiştirme yazarlığı
  çalmaz. Başka dosyalardan kopyalanan satırları da izleyen `-C` için `--copies` ekleyin; daha
  yavaştır.
- `commits` sütunu, ref'ten erişilebilen merge dışı commit'leri sayar; isteğe bağlı bir
  `--since` / `--until` penceresi içinde. Farklı zamanlarda katılan kişileri karşılaştırırken pencereyi
  kişinin görev süresine daraltın.
- İkili dosyalar atlanır. Kimlikler deponun `.mailmap` dosyasını izler; bir yazarın birden
  çok adresini birleştirmek için bir tane ekleyin. İki satır aynı adı taşıyorsa tablo adresi
  gösterir, karışmasınlar diye.

## Seçenekler

```
--ref <rev>          revision to analyse (default: HEAD)
--sample <n>         deterministic 1-in-n file sample, n >= 1 (default: 1, every file)
--seed <text>        salt for the sample hash; change it to draw a different sample
--include <glob>     only files matching the glob (repeatable; ** and * supported)
--exclude <glob>     skip files matching the glob (repeatable)
--since <date>       commit-share window start (passed to git log)
--until <date>       commit-share window end
--copies             pass -C to git blame as well as -w -M (slower, follows copies)
--jobs <n>           parallel blame processes (default: 4)
--top <k>            rows to print (default: 10)
--json               print JSON instead of a table
--csv                print CSV (author,mail,lines,line_share,commits,commit_share)
--cwd <dir>          repository directory (default: current directory)
```

`--` sonrasındaki yollar git'e pathspec olarak geçer; `-- src packages/core` hem blame'i hem
commit sayımını o dizinlere daraltır. Eğik çizgi içermeyen bir glob dosya adıyla eşleşir, bu
yüzden `--exclude '*.test.ts'` her derinlikte çalışır.

`--json` tablonun kurulduğu her şeyi, örnekleme parametreleri dahil, yazdırır; böylece bir sayı
onu üreten komutla birlikte alıntılanabilir. `--csv` elektronik tablolar için yazar başına bir
satır verir.

## Kim tek kişi

Bir kişi dizüstünden ve iş makinesinden ayrı adreslerle commit attığında, buradaki bütün sayılar
o kişiyi ikiye böler ve kimse fark etmez. `--identities` bunu gösterir: aynı ismin iki adreste
görünmesi, aynı adres adının iki alan adında görünmesi ve bir GitHub noreply adresindeki
kullanıcı adının başka bir satırda isim ya da adres olarak geçmesi. `dev@` gibi rol adresleri ve
bot adresleri dışarıda bırakılır. Karşılaştırma, Türkçe bir ismin kendisiyle eşleşmesini sağlayan
harf katlamasıyla yapılır.

Çıktı, deponun köküne konacak bir `.mailmap` dosyasının satırlarını yazar. O dosyayı `git log`,
`git blame` ve `git shortlog` da okur, yani tek dosya bütün sayıları düzeltir. Araç hiçbir şey
yazmaz ve iki kimliğin gerçekten aynı kişi olup olmadığını bilemez; kanıtı gösterir ve durur.

## git shortlog ve git-fame ile karşılaştırma

`git shortlog -sn` commit sayar; bu, aracın son iki sütununda yazdırdığı etkinlik sayısıdır,
fazlası değil. `git fame` (Python aracı) da her dosyayı blame'ler ve yazar başına satır
raporlar; en yakın akrabadır. Farklar: surviving-lines dosyaları deterministik örnekler, bu
yüzden büyük bir depoda çalıştırma saniyeler içinde biter ve aynı tuzla bir başkası tarafından
yeniden üretilebilir; commit payını satır payının yanında yazdırır, boşluk görünür olur;
`.mailmap`'i izler ve aynı adları ayırt eder; bağımlılığı yoktur. Dosya başına ayrıntı ya da
zaman içinde hayatta kalma istiyorsanız git fame ya da özel bir `git log -L` daha iyi araçtır.

## Neyi gösteremez

Araç bunu her tablonun altına basar, çünkü sayıyı kötüye kullanmak kolaydır:

- Satırların kalitesi ya da var olmaları gerekip gerekmediği hakkında hiçbir şey söylemez.
- Kod incelemesi yorumları, tasarım belgeleri, eşli çalışma ve mentorluk geride satır bırakmaz.
- Bilerek silinen kod kimseye sayılmaz; o ay silmek en iyi katkı olsa bile.
- Üretilmiş dosyalar ve vendored kod, onları commit'leyeni şişirir. Hariç tutun.
- Kimsenin dokunmadığı bir dosyadaki yüksek blame payı ile herkesin dokunduğu bir dosyadaki
  yüksek blame payı aynı şey değildir. Araç çekişmeye göre ağırlıklandırmaz.

"Kimin kodu hâlâ burada?" sorusuna cevap için kullanın, "en iyi mühendis kim?" için değil.

## Nereden geldi

İki özel kod tabanındaki kendi payımı, başka birinin bana güvenmeden kontrol edebileceği
biçimde anlatmam gerekiyordu. Commit sayısı açık seçenekti ve yanlış olandı: bir kod
tabanında blame payım commit payımdan yüksekti, diğerinde düşüktü ve iki gerçek de sayıların
ikisinden fazlasını anlatıyordu. Yöntem
[How to show engineering ownership when the repositories are private](https://efe-genc-portfolio.vercel.app/writing/showing-ownership-private-repositories/)
yazısında anlatılıyor; bu, her yerde çalışacak biçimde temizlenmiş betiktir.

## Geliştirme

```
npm test        # node:test, builds a throwaway repository with two authors, a rewrite, a rename and a binary
npm run lint    # node --check
```

MIT.
