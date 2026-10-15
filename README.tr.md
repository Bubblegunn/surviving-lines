# surviving-lines

[English](README.md) | Türkçe

Bir git ref'inde hâlâ yaşayan kodu kimin yazdığını, commit payının yanında ölçer.

Commit sayısı etkinliği ölçer. `git blame` ise sonraki her yeniden düzenlemeden sağ çıkanı
ölçer. İki sayı sanıldığından daha sık ayrışır ve ilginç olan genellikle aradaki boşluktur:
blame payı commit payının üstünde olan biri başkalarının kodunu değiştiren kodu yazmıştır;
altında olan biri ise değiştirilen kodu yazmıştır.

Tek dosya, bağımlılık yok, Node 22 ya da üstü, git 2.15 ya da üstü, `git`'in okuyabildiği her depo.

```
npx surviving-lines --sample 5 --include '**/*.ts' --exclude '**/*.test.ts'
```

Git alt komutunu kullanmak için paketi global olarak kurun:

```
npm install --global surviving-lines
git surviving-lines --version
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
yoktur, git yolları her zaman ileri eğik çizgi kullanır. Bu yüzden aynı komut Node 22
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
- Dosya içermeyen bir örneklem ya da filtrelerin boşalttığı bir çalıştırma, %0,0 paylardan oluşan
  bir tablo basmak yerine çıkış kodu 1 ile durur ve sebebini söyler: hiçbir dosyayla eşleşmeyen
  `--include` desenleri ([#40](https://github.com/Bubblegunn/surviving-lines/pull/40)), `--`
  sonrasında hiçbir dosyayla eşleşmeyen pathspec'ler ya da her dosyayı çıkaran bir `--exclude`
  ([#45](https://github.com/Bubblegunn/surviving-lines/pull/45)). Katkı:
  [@Enard52](https://github.com/Enard52).
- Sığ bir klon (shallow clone) çıkış kodu 1 ve `git fetch --unshallow` komutunu adlandıran bir
  mesajla reddedilir. Sığ klonda alınan en eski commit kendinden önceki bütün geçmişin yerine
  geçer, bu yüzden blame daha eski her satırı o commit'in yazarına verir: bu deponun
  `git clone --depth 1` kopyasında HEAD yazarı 6.069 satırın 6.069'unu ve 1 commit'in 1'ini
  aldı; tam klonda 5.973 satır ve 48 commit'in 41'i (2026-10-14'te ölçüldü). `actions/checkout`
  `fetch-depth: 0` verilmedikçe tek commit çeker. `--allow-shallow` yine de çalıştırır ve çıktıyı
  işaretler: tablonun, Markdown'ın ve `--identities`'in ilk satırında `shallow clone`, `--json`
  içinde `"shallow": true`, `--csv` için stderr'de bir satır.
- git 2.15 ya da üstü gerekir; daha eski bir git, `git 2.15 or newer is required` mesajı ve
  çıkış kodu 1 ile durdurulur. Sınırı sığ klon kontrolü koyar: `git rev-parse
  --is-shallow-repository` 2.15.0'da geldi ve git tanımadığı bir `rev-parse` bayrağını geri
  basıp 0 ile çıkar (2.50.1'de uydurma bir bayrakla denendi); yani eski bir git her sığ klonu
  tam klon sanardı. Kullanılan diğer özellikler git sürüm notlarına göre daha eskidir:
  `blame --line-porcelain` 1.7.6, `git -c` 1.7.2, `core.precomposeunicode` 1.7.12. CI yalnızca
  her çalıştırıcı imajının getirdiği git'i kullanır, yani 2.15'in kendisi test edilmez.

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
--sort <key>         lines (default), commits, or gap (absolute share difference)
-q, --quiet          suppress progress output on stderr
--json               print JSON instead of a table
--csv                print CSV (author,mail,lines,line_share,commits,commit_share)
--markdown           print a Markdown table
--identities         list addresses that look like one person, with .mailmap lines
--allow-shallow      run in a shallow clone anyway; every output is marked "shallow clone"
--cwd <dir>          repository directory (default: current directory)
```

`--` sonrasındaki yollar git'e pathspec olarak geçer; `-- src packages/core` hem blame'i hem
commit sayımını o dizinlere daraltır. Eğik çizgi içermeyen bir glob dosya adıyla eşleşir, bu
yüzden `--exclude '*.test.ts'` her derinlikte çalışır.

`--json` tablonun kurulduğu her şeyi, örnekleme parametreleri dahil, yazdırır; böylece bir sayı
onu üreten komutla birlikte alıntılanabilir. Çıktı `schemaVersion` ve `tool: { name, version }`
ile başlar; yapısı pakette gelen [`schema/surviving-lines.schema.json`](schema/surviving-lines.schema.json)
dosyasında tarif edilir ve bir anahtar silindiğinde, adı ya da türü değiştiğinde `schemaVersion` artar. `--csv` elektronik tablolar için yazar başına bir
satır verir.

`--sort gap`, satır payı ile commit payı arasındaki mutlak farkı en büyük olandan başlayarak
sıralar; eşitliklerde mevcut satır, commit ve adres sırası korunur. JSON, seçilen anahtarı
`sort` alanında taşır ve şema bu alanı tanımlar. Bu özellik [@Aaqibhafeezkhan](https://github.com/Aaqibhafeezkhan)
tarafından [#30 numaralı issue](https://github.com/Bubblegunn/surviving-lines/issues/30) için eklendi.

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

## Her yazıdaki isimler

Bir isim ASCII değildir ve bunu yanlış yapmanın iki ayrı sonucu olur. Biri hizalanmayan bir
sütundur, can sıkıcıdır. Diğeri iki kez sayılan bir kişidir, yani yanlış bir sayıdır.

Sayıyı değiştiren iki hata Unicode 17.0'a bakılarak düzeltildi:

- `Weiß` ile `WEISS` tek kişidir. `toLowerCase` Unicode'un basit harf katlamasıdır ve ß'ye
  dokunmaz, bu yüzden iki yazım hiç buluşmuyordu. Tam katlama ß'yi ss'ye eşler
  ([CaseFolding.txt](https://www.unicode.org/Public/UCD/latest/ucd/CaseFolding.txt), durum `F`)
  ve araç artık karşılaştırmadan önce aynısını yapıyor.
- Tam genişlikli Latin harfleriyle yazılan bir isim, ki Japonca ya da Korece bir klavyede mod
  değiştirmeden yazılan budur, ASCII ile yazılan aynı isimdir. Eşleştirme NFKC'ye normalleştirir,
  böylece iki biçim buluşur; ﬁ bağlaması ve uyumluluk ideografları da öyle.

Türkçe noktalı ve noktasız i ile ayrışık ve birleşik aksanlar zaten katlanıyordu. Katlama yalnız
eşleştirme içindir; tabloda yazan her zaman git'in tuttuğu yazımdır.

Görüntü işin diğer yarısı:

- Arapça ya da İbranice bir isim, bütün satırı kendi etrafında ters çeviriyordu: isim sağ kenara
  gidiyor, ardındaki dört sayı ters sıralanıyor ve her yüzde işareti kendi sayısının önüne
  düşüyordu. Güçlü sağdan sola karakter taşıyan isimler artık U+2068 ve U+2069 ile sarılıyor;
  [UAX #9](https://www.unicode.org/reports/tr9/) tam olarak bunun için bu yalıtıcıları tanımlar.
  Görünmezler, hiçbir sütun yer kaplamazlar ve diğer yazılardaki satırlar bayt bayt eskisi gibi
  kalır.
- Sütun genişlikleri artık elle yazılmış bir listeden değil, Unicode Karakter Veritabanı'ndan
  geliyor. Yerine geçtiği liste, standartla atanmış 8.645 kod noktasında ayrılıyordu ve emojinin
  çoğunu tek sütun genişliğinde sayıyordu; ters yönde de 231 kod noktasında ayrılıyordu. Daha
  yeni bir Unicode sürümüne göre tabloyu yeniden üretmek için
  `node scripts/gen-width-table.mjs`.

Üç şey bilerek böyle ve değişmeyecek:

- Sayılar `en-US` biçiminde kalır, yani `12,345` kimde çalışırsa çalışsın on iki bindir. Binlik
  ayıracı okuyucunun makinesine göre değişen bir rapor, başka bir yerde çalıştırılmış aynı
  raporla karşılaştırılamaz; bu çıktının amacı da iki çalıştırmayı karşılaştırmaktır.
- Metin sunumlu emoji tek sütun sayılır; standardın dediği budur, bazı terminaller ise
  katılmaz. Her terminalde doğru olan tek bir cevap yok, o yüzden standardın kendi genişliği
  kazanır.
- `.mailmap` isimlerini bu araç değil git eşleştirir. git bu isimleri yalnız ASCII harfleri için
  büyük küçük harf farkını yok sayarak karşılaştırır; git 2.50.1 üzerinde doğrulandı:
  `josÉ Álvarez` yazılmış bir satır `JOSÉ ÁLVAREZ` imzalı bir commit ile eşleşiyor,
  `josé álvarez` yazılmış olan eşleşmiyor. Mümkün olan her yerde adresle eşleyin; isimle
  eşliyorsanız commit'lerdeki yazımın aynısını yazın.

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

## Atıf

Her sürüm Zenodo'da bir DOI ile arşivleniyor, böylece bir makale ya da rapor tam olarak
çalıştırdığı koda işaret edebiliyor.

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22394614.svg)](https://doi.org/10.5281/zenodo.22394614)

Bu **kavram** DOI'si: her zaman en yeni sürüme çözümlenir. Çalıştırdığınız sürümün kendisini
atıflamak için o sayfayı açıp yan çubuktan sürümü seçin ve orada yazan DOI'yi kullanın.
Depodaki `CITATION.cff` aynı tanımlayıcıyı taşıyor, bu yüzden GitHub'ın "Cite this repository"
düğmesi elle kopyalama olmadan doğru BibTeX ve APA üretiyor.

## Geliştirme

```
npm test        # node:test, builds a throwaway repository with two authors, a rewrite, a rename and a binary
npm run lint    # node --check
```

MIT.
