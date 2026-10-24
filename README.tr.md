# surviving-lines

[English](README.md) | Türkçe

Bu depodaki kodu gerçekte kimin yazdığını bilmek istiyorum ama commit sayısı yalnızca kimin meşgul olduğunu gösteriyor; kendi blame betiklerim biçimlendirici commit'lerini ve botları da yazar sayıyor, bir kişiyi de iki kez listeliyor.

surviving-lines, bir git deposunda her yazarın hâlâ kodda duran satırlarını `git blame` ile sayan ve yazarın commit payının yanında gösteren bir komut satırı aracıdır.

```
npx surviving-lines
```

![surviving-lines terminal kaydı: yazar tablosu, dizin başına tablo ve iki adresi olan bir kişi için önerilen .mailmap satırları](docs/demo.gif)

Kayıt, bu deponun `bin/surviving-lines.js` dosyasının gerçek bir çalıştırmasıdır; [`docs/demo.tape`](docs/demo.tape) ile betiklenmiştir.

## Fark nedir

git-fame 4.2.1, git-who v1.3 ve git-extras 7.5.0 aynı örnek depolarda çalıştırılarak ölçüldü; ayrıntılar [`docs/COMPARISON.md`](docs/COMPARISON.md) içinde, İngilizce tablo [README.md](README.md) içinde. Özet: satır ve commit sayıları, `.git-blame-ignore-revs`, `Co-authored-by:` payı ve uzantı başına toplamlar git-fame ile aynı çıkıyor. Yalnızca bu araçta olanlar: aynı tuzla aynı dosyaları seçen deterministik örnek, varsayılan olarak botları iki paydan çıkarma, adresi olmayan bir `Assisted-by:` satırında durmama, AI asistanı satırlarını ayrı sayma ve iki adresi olan bir kişi için `.mailmap` satırı önerme. Ayrıca bu araç, hiçbir ignore dosyasında adı geçmeyen biçimlendirme commit'lerini listeler ve sayılarını yanına yazar; git-fame'de böyle bir liste yoktur. git-fame ise tek çalıştırmada birden çok depo, svg ile yaml çıktısı ve blame tarafına da uygulanan `--since` penceresi konularında öndedir. Sık sorulanlar [`docs/FAQ.md`](docs/FAQ.md) içinde.

Commit sayısı etkinliği ölçer. `git blame` ise sonraki her yeniden düzenlemeden sağ çıkanı
ölçer. İki sayı sanıldığından daha sık ayrışır ve ilginç olan genellikle aradaki boşluktur:
blame payı commit payının üstünde olan biri başkalarının kodunu değiştiren kodu yazmıştır;
altında olan biri ise değiştirilen kodu yazmıştır.

Tek dosya, bağımlılık yok, Node 22 ya da üstü, git 2.15 ya da üstü, `git`'in okuyabildiği her depo.

Üç yoldan biriyle çalıştırabilirsiniz:

- `npx surviving-lines` kurmadan bir kez çalıştırır.
- `/plugin install surviving-lines --marketplace Bubblegunn/surviving-lines` Claude Code eklentisini ekler; minimum Claude Code sürümü için aşağıdaki [Claude Code eklentisi olarak](#claude-code-eklentisi-olarak) bölümüne bakın.
- `npx skills add Bubblegunn/surviving-lines` beceriyi skills CLI ile ekler.

Git alt komutunu kullanmak için paketi global olarak kurun:

```
npm install --global surviving-lines
git surviving-lines --version
```

### Claude Code eklentisi olarak

```
/plugin install surviving-lines --marketplace Bubblegunn/surviving-lines
```

Bu tek adımlı biçim Claude Code 2.1.275 ve üstünde çalışır. Daha eski sürümde iki adım kullanın:

```
/plugin marketplace add Bubblegunn/surviving-lines
/plugin install surviving-lines@surviving-lines
```

Eklenti tek bir beceri ekler. Aracın cevapladığı soruyu ajana sorduğunuzda ajan tahmin yürütmez, aracı kendisi çalıştırır: önce eklentinin kendi klasöründeki kopyayı, o yoksa kurulu komutu, o da yoksa `npx` kullanır. Beceri; kodun kime ait olduğunu, bir yolu kimin gözden geçirmesi gerektiğini, bir yolun geçmişini, bus factor'ü, sahipliği bir biçimlendirme commit'inin devraldığı durumları, aynı kişinin iki adresini ve yazar başına toplamları soran sorularda devreye girer.

Eklenti ayrıca bir istem ipucu da ekler. Bir istem yinelenen kimliklerle veya kod sahipliğiyle ilgiliyse, bir kanca isteği ve çalışma dizinini okur ve ajan için kısa bir not ekler. Not, ajana tahmin yürütmek yerine beceriyi ve aracı kullanmasını söyler. Depoda şüphelenilen aynı kişi grupları varsa not bunlardan en fazla dördünü, her birini öneren kuralla birlikte listeler (bir isim iki adreste, bir adres iki isim altında, bir isim `@` öncesinde iki alan adında, ya da bir GitHub noreply girişi başka bir isim veya adres adına eşit), her adresin commit sayısıyla birlikte. Not, siz onaylayana kadar grupların tahmin olduğunu her zaman söyler.

Kanca yalnızca salt okunur git komutları çalıştırır (`rev-parse`, `rev-list --count` ve `shortlog -sne --no-merges`). Hiçbir şey yazmaz ve ağ çağrısı yapmaz. Git deposu dışında, git yoksa ve 20.000 commit'in üzerindeki depolarda sessiz kalır; `SURVIVING_LINES_HINT_CAP` bu sınırı değiştirir ve çoğunlukla testler için vardır. Not en fazla 1.200 karakter ekler. Yalnızca Claude Code eklentisinde çalışır, npm komutunda çalışmaz.

Rastgele üretilmiş, 60 yazarlı 10.000 commit'lik bir depoda ölçüldü: eşleşen bir istem yaklaşık 149 ms, eşleşmeyen bir istem yaklaşık 22 ms sürdü (makine meşgulken ölçüldüğü için bunları mertebe olarak okuyun). 20 ilgisiz test isteminin hiçbiri kancayı tetiklemedi. Sınırdaki 10 istemin 5'i tetikledi; örneğin `git blame`'in ne yaptığına dair genel bir soru. Kanca genel bir soruyu deponuz hakkındaki bir istekten ayıramaz.

Kancayı kaldırmak için, eklentinin yerel bir kopyasında `hooks/hooks.json` dosyasını silin (ya da boşaltın), ya da eklentiyi devre dışı bırakın.

## Örnek

```
npx surviving-lines --ref 1e37ea6 --top 3
```

```
ref 1e37ea6  ·  files 71/71 sampled (1 in 1)  ·  9,823 of 9,835 lines attributed
git blame -w -M  ·  commits 73, merges excluded
bots excluded: 1 identity, 12 lines, 7 commits (--include-bots counts them)

author                lines   share  commits   share
----------------------------------------------------
Efe Genc              9,335   95.0%       67   91.8%
Aaqibhafeez Khan        221    2.2%        2    2.7%
Ensar                   182    1.9%        3    4.1%
… 1 more author

What this cannot show: quality of the lines, review work, design done in documents,
or code that was deleted on purpose. Share of surviving lines is about survivorship, not merit.
```

Bu çalıştırma, bu deponun `1e37ea6` sürümünde (20 Ekim 2026), bir kopyasından çalıştırılarak yapıldı.
Botlar dışarıda bırakılır; bu yüzden commit sayısı dependabot'un 7 commit'ini saymaz. En üstteki yazar
hâlâ duran satırların %95,0'ını ve commit'lerin %91,8'ini tutuyor; buradaki fark küçük, daha büyük
fark [`research/`](research/README.md) içindeki araştırmada.

## Neden örnekleme

`git blame` okuduğu her dosya için geçmişi dolaşır. Deterministik bir örnek daha az dosya
okur ve daha önemlisi çalıştırmayı yeniden üretilebilir kılar: dosya kümesi her
yolun hash'i (FNV-1a) ve isteğe bağlı bir tuz ile seçilir, böylece depoya ve aynı komuta sahip
herkes aynı dosyaları ve aynı sayıları alır. Farklı bir örnek çekmek ve payların tuttuğunu
görmek için tuzu değiştirin.

`--sample 1` (varsayılan) her dosyayı blame'ler. [`docs/COMPARISON.md`](docs/COMPARISON.md) iki kipin
duvar saati süresini tek bir örnek depoda raporlar (P17 satırı); büyük depolar için iddia içermez,
benchmark için #35 numaralı konu açıktır.

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

| tuz | dosya | atfedilen satır | en üst yazar | ikinci yazar |
|---|---|---|---|---|
| (yok) | 50/203 | 59.049'un 14.638'i | %52,7 | %22,6 |
| `second` | 45/203 | 59.049'un 12.607'si | %59,5 | %24,4 |
| `third` | 47/203 | 59.049'un 12.851'i | %57,1 | %22,9 |

En üstteki yazar için yaklaşık yedi puanlık bu yayılma, bu depoda 5'te 1 örneğin değeridir:
sıralama ve commit payıyla arasındaki fark (ikisi için de %22,2) her tuzda tutar, ikinci
ondalık tutmaz. Pay, deponun değil örneklenen satırların payıdır ve örnek dosya bazında
seçildiği için tek bir büyük dosya payı oynatabilir. Tek bir sayı önemliyse `--sample 1`
çalıştırın; örneklenmiş bir sayıyı alıntılarken `--json` çıktısındaki `sample.every`,
`sample.seed`, `filesSampled` ve `linesAttributed` alanlarını yanına yazın; tablonun ilk
satırı zaten bunları basar.

## Ne sayar

- `lines` sütunu, örneklenen dosyalarda, `git blame -w -M`'nin gördüğü hâliyle son
  değişikliği yazara ait olan satırları sayar. `-w` yalnızca boşluk değişikliklerini yok sayar, `-M` dosya
  içinde taşınan satırları izler; böylece yeniden biçimlendirme ve yer değiştirme yazarlığı
  çalmaz. Başka dosyalardan kopyalanan satırları da izleyen `-C` için `--copies` ekleyin.
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

- Deponun kendi `.git-blame-ignore-revs` dosyası varsayılan olarak okunur ve `git blame --ignore-revs-file`
  ile verilir; bu dosyada listelenen bir biçimlendirme commit'i dokunduğu satırları almaz. `--no-ignore-revs`
  bunu kapatır, `--ignore-revs-file <f>` başka bir dosya verir. git 2.23 ya da üstü gerekir.
- Botlar iki sütundan da çıkarılır: adı `[bot]` ile biten ya da GitHub uygulaması, Renovate, GitLab veya Gitea
  bot adresi olan kimlikler. Çıktının ikinci satırı kaç kimlik, satır ve commit çıkarıldığını yazar;
  `--include-bots` bunları yeniden sayar.
- `--co-authors share` her satırı ve commit'i yazar ile `Co-authored-by:` satırlarındaki kimlikler arasında
  eşit böler. `--ai-breakdown` ek olarak mesaj satırlarında bir AI asistanı adı geçen commit'lerin satır ve
  commit sayısını yazar. Bu satırları sayar, yazarlığı saptamaz.
- `--group-by dir` (ya da `dir:<n>`, `ext`) aynı ölçümü dizin ya da uzantı başına verir. `--suggest-codeowners`
  CODEOWNERS satırları yazdırır, hiçbir dosya yazmaz.

## Seçenekler

```
--ref <rev>          revision to analyse (default: HEAD)
--sample <n>         deterministic 1-in-n file sample, n >= 1 (default: 1, every file)
--seed <text>        salt for the sample hash; change it to draw a different sample
--include <glob>     only files matching the glob (repeatable; ** and * supported)
--exclude <glob>     skip files matching the glob (repeatable)
--since <date>       commit-share window start (passed to git log)
--until <date>       commit-share window end
--copies             pass -C to git blame as well as -w -M (follows copies)
--jobs <n>           parallel blame processes (default: 4)
--top <k>            rows to print (default: 10)
--sort <key>         lines (default), commits, or gap (absolute share difference)
-q, --quiet          suppress progress output on stderr
--json               print JSON instead of a table
--csv                print CSV (author,mail,lines,line_share,commits,commit_share)
--markdown           print a Markdown table
--identities         list addresses that look like one person, with .mailmap lines
--co-authors <mode>  none (default) or share: split each line and commit equally between the author
                     and the Co-authored-by trailer identities (.mailmap applies to them)
--ai-breakdown       also print surviving lines and commits whose message trailers name an AI assistant
--group-by <key>     one block per group of files: dir (top-level directories), dir:<n> (n levels deep), or ext
--suggest-codeowners print CODEOWNERS lines for the groups, from the surviving lines (needs --group-by dir; never written)
--include-bots       count bot identities as authors (default: leave them out of both shares)
--ignore-revs-file <f>  skip the revisions listed in <f> when blaming (git 2.23 or newer);
                       default: .git-blame-ignore-revs at the repository root, when it exists
--no-ignore-revs     do not read .git-blame-ignore-revs
--ignore-rev <rev>   skip one commit when blaming (repeatable; git 2.23 or newer)
--no-detect-reformat turn off the reformat heuristic (on by default): it finds suspected whitespace or quote
                     commits and, unless --keep-reformat, leaves them out of the numbers
--keep-reformat      count the suspected reformat commits in the numbers, as before the correction; the block
                     still lists them. Not applied under --co-authors share
--merge-identities   count the suggested same-person addresses as one, in memory (nothing written)
--bus-factor-threshold <n>  percent of the lines counted that the bus factor must reach (default: 50)
--reviewers <path>   list who should review a file or directory
--history <path>     list who changed a file or directory, oldest first: first and last commit, commits, lines now
                       --since and --until do not narrow its dates or commit counts (they can drop a person with no lines left)
--allow-shallow      run in a shallow clone anyway; every output is marked "shallow clone"
--cwd <dir>          repository directory (default: current directory)
```

Bir terminaldeki kişi bir tabloyu, grup görünümünü ya da reviewers görünümünü ilk kez okuduğunda, stderr'de bir satır GitHub'da yıldız vermesini ister. Bir işaret dosyası, bu satırın o kullanıcı için bir daha çıkmasını önler. `SURVIVING_LINES_NO_STAR_HINT=1` bunu kapatır; `-q` ya da `--quiet` yalnızca o çalıştırmada atlar. CI'da (`CI` tanımlıyken), `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CODEX_SANDBOX` ya da `AI_AGENT` değişkenlerinden biri tanımlıyken ya da `--json`, `--csv`, `--markdown` ve `--identities` ile hiçbir zaman çıkmaz.

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

## Kim bu dosyayı gözden geçirmeli

`--reviewers <yol>` bir dosyanın ya da dizinin yazarlarını, en çok hayatta kalan satırı olan başta olmak üzere listeler. Her biri için o yol altındaki satırları, orada yaptığı commit'leri, orada en son commit'inin tarihini ve aktif olup olmadığını gösterir. Aktif, o yolda referans commit'in yazar tarihinden önceki bir yıl içinde commit atmış olmak demektir. Tarih saatten değil referans commit'inin yazar tarihinden alınır; bu yüzden cevap çalıştırdığınız güne göre değişmez.

```sh
npx surviving-lines --reviewers lib
```

`suggested` satırı en fazla üç kişiyi, önce aktif olanları yazar. Öneri tablonun okuduğu satırları okur; bu yüzden varsayılan olarak dışarıda bırakılan bir biçimlendirme commit'i önerinin de dışındadır. Bu bir başlangıç noktasıdır: kalan kodu kimin yazdığı, bir sonraki değişikliği kimin gözden geçirmesi gerektiğiyle her zaman aynı değildir.

`--reviewers` ve bus factor, bir `.mailmap` iki adresi birleştirene kadar bir kişinin iki adresini ayrı sayar. `suggested` satırı tek istisnadır: yalnızca aynı isme sahip adresleri birleştirir, başka hiçbir şeyi değil.

## Bir yolu kimler şekillendirdi

`--history <yol>` bir dosya ya da dizin alır ve o yolu değiştiren kişileri, en eskiden başlayarak listeler. Her satır o yoldaki ilk ve son commit'i, oradaki commit sayısını ve referansta o kişiye ait kalan satırları verir. Yalnızca biçimlendirme yapan bir commit ayrılır (`set aside`): sayılmaz ve yalnızca biçimlendirme commit'i olan bir kişinin satırı çıkmaz. Listenin altındaki satır, ilk commit'i kimin attığını ve bugün en çok satırı kimin tuttuğunu söyler.

```sh
npx surviving-lines --history lib/index.js
```

`--since` ve `--until` bu görünümün tarihlerini ya da commit sayılarını daraltmaz; her zaman referansın tamamını kapsar. Yine de satır düşürebilirler: pencere içinde hiç commit'i olmayan ve kalan satırı olmayan bir kişi listeden çıkar. Sonradan tüm satırları üzerine yazılmış bir kişi, pencere olmayan bir çalıştırmada 0 satırla görünmeye devam eder.

`--history` kendi görünümünü yazdırır; yalnızca `--json` ile birleştirilebilir. `--reviewers`, `--csv`, `--markdown`, `--identities`, `--group-by`, `--suggest-codeowners` ya da `--` sonrası yol kalıplarıyla birleştirilemez.

## Biçimlendirme commit'leri

`git blame -w` boşlukları yok sayar, ama tırnak değişikliğini yok saymaz. Tek tırnağı çift tırnağa çeviren bir biçimlendirici çalıştırması, kodda bir şey değişmese bile yeniden yazdığı her satırı alır. surviving-lines bu tür commit'leri varsayılan olarak arar ve sayıların dışında bırakır. Yalnızca boşluk ya da tırnak değişikliği içeren bir commit algılanmış biçimlendirme commit'i olur: tablo onun satırlarını saymaz, tablonun altındaki blok commit'i adlandırır, tuttuğu hayatta kalan satır sayısını verir ve en çok satırı etkilenecek beş yazar için düzeltme olmadan rakamları ile düzeltme olmadan bus factor'ü yazar.

Algılama bir şüphedir, kanıt değildir. Düzeltmeye güvenmeden önce commit'i `git show <id>` ile okuyun. Düzeltme tabloyu, grup görünümünü, `suggested` önerisini, CSV çıktısını ve `--history` görünümünü etkiler; `--ai-breakdown` düzeltilmiş geçişi okur.

- `--keep-reformat` commit'i yine sayılara katar; blok yine onu listeler ve sayıların onu içerdiğini söyler.
- `--co-authors share` düzeltmeyi uygulamaz. Bloğu bunu söyler ve sayılar commit'i içerir.
- Kimliğini deponun kökündeki `.git-blame-ignore-revs` dosyasına eklemek (bu dosya varsayılan olarak okunur) ya da tek bir çalıştırma için `--ignore-rev <rev>` vermek (birden çok kez verilebilir; git 2.23 ya da üstü), commit'i blame'de yok sayar. Algılama o zaman şüphe bulmaz ve blok yazdırılmaz.

`--no-detect-reformat` tespiti kapatır. Tespit, ignore dosyası gibi git 2.23 ya da üstünü gerektirir.

Kontrolün tanımadıkları:

- Boşluk değişikliklerine bakar; JavaScript, TypeScript, Python, JSON, CSS, SCSS, Vue ve Svelte dosyalarında (js, jsx, mjs, cjs, ts, tsx, py, json, css, scss, vue, svelte uzantıları) ayrıca tek tırnağın çift tırnağa çevrilmesine bakar. Diğer dosyalarda yalnızca boşluk katlanır, çünkü orada tırnak değişikliği programı değiştirebilir (örneğin bir kabuk betiğinde).
- Sondaki virgüller, noktalı virgüller ve parantezler tanınmaz. Bunları ekleyen ya da silen commit listelenmez.
- Dosya ekleyen, silen ya da yeniden adlandıran bir commit, ya da 1000'den fazla dosyayı değiştiren bir commit değerlendirilmez.
- Bu bir sezgisel yöntemdir. Listelenen commit bir şüphedir, kanıt değil; yok saymadan önce `git show <id>` ile okuyun.

## Bus factor

Bus factor, hayatta kalan satırları birlikte sayılan satırların belirli bir payına ulaştıran en küçük yazar sayısıdır. Varsayılan pay %50'dir. `--bus-factor-threshold <n>` bunu değiştirir; 0'dan büyük ve en fazla 100 olabilir. Satır tablonun altında yazdırılır:

```
bus factor 2: Troy Goode <troy@work.example> and Douglas Christopher Wilson together hold 56.5% of 1,985 surviving lines
```

Commit sayılarını değil satırları izler. Kalan kodun ne kadar yoğunlaştığını ölçer; kimin onu anladığını ölçmez.

## Bu yeni satırlar nasıl görünür

Test deposunda (`expressjs/cors` kopyası, üç sentetik commit; ayrıntı [`docs/HEAD-TO-HEAD.md`](docs/HEAD-TO-HEAD.md) içinde) bu depodaki kod (`node bin/surviving-lines.js`; bir sonraki sürümden sonra `npx surviving-lines`) tablonun altına varsayılan olarak şu satırları yazar. Tek değişiklik, gerçek bir adresin `troy@work.example` ile değiştirilmiş olmasıdır:

```
identity hint: 1 person may be counted twice (Troy Goode: troy@laptop.example, troy@work.example). The table counts each address separately. Run --identities for the .mailmap lines; only you can confirm it is one person. If they are one person, Troy Goode holds 810 lines (40.8%).

bus factor 2: Troy Goode <troy@work.example> and Douglas Christopher Wilson together hold 70.1% of 1,985 surviving lines
bus factor = the smallest number of authors whose surviving lines together reach 50% of the lines counted (change with --bus-factor-threshold). It measures how concentrated the code that is left is, not who understands it.
```

Biçimlendirme commit'i dışarıda bırakıldığında bir blok onu adlandırır ve ne kadar satır yeniden yazdığını söyler. Commit'i yapan kişinin adının yanına satır toplamı koymaz, çünkü bu satırlar o kişinin kodu değildir. Yalnızca düzeltmeyle satır kazanan kişileri, düzeltmeli ve düzeltmesiz sayılarıyla listeler. Bob'un Ada'nın dosyasındaki tüm tırnakları değiştirdiği sentetik bir depodaki (`scripts/fixtures.mjs`, `quotes` fixture'ı) blok:

```
reformat commit ignored (looks like whitespace and quote changes only): 1 commit
  commit a5a4525 "style: switch app.js to double quotes" rewrote 30 lines in 1 file (formatting only)
  The table above does not count it. Authors who gain lines from this: Ada 35 (100.0%) with the correction, 5 (14.3%) without. --keep-reformat counts it; --ignore-rev a5a4525 (or an entry in .git-blame-ignore-revs) sets it aside by hand.
  bus factor without the correction: 1 (Bob alone leads the plain count)
```

`--keep-reformat` ile biçimlendirme commit'i sayılara katılır, blok bunu söyler ve kimlik ipucunun son cümlesi şöyle olur: `... If they are one person, Troy Goode holds 715 lines (36.0%).`

## Boş satırlar, dosya görünümü, yalnızca boşluk değiştiren commit

Sayılan satırlardan boş satırlar çıkarıldığında (başlıkta `non-blank; N with blank lines` yazar) yazar tablosuna `with blank` ve `share` sütunları eklenir, `bus factor` satırı iki tabanı da yazar ve fark varsa `counting blank lines: bus factor N` ekler. `--json` çıktısında `linesWithBlank`, `shareWithBlank` ve `busFactor.withBlank` bulunur. Satır sırası boş olmayan satırlara göredir. Varsayılan görünüm, `--reviewers` ve `--history` tablonun altına tek bir `top:` satırı basar: `top: <author> holds <n> non-blank lines (<share>), <m> counting blank lines (<share>)`; böylece alıntılanan tek satır iki sayma biçimini de taşır. Aynı `with blank` ve `share` sütunları `--reviewers`, `--history` ve `--group-by` bloklarında da görünür, `--json` bu satırlara `linesWithBlank` ve `shareWithBlank` ekler.

`--files [n]` her dosya için bir satır basar, en büyük önce (varsayılan 25): satır sayısı, ilk sahip ve payı, sonraki iki sahip, sonra `files: K; one owner above 80% in M; no owner above 50% in P`. `--group-by`, `--csv`, `--markdown`, `--identities`, `--reviewers`, `--history` ve `--co-authors share` ile birlikte kullanılamaz.

Bir dosyanın en az 20 satırını yeniden yazıp `git blame -w` ile görünen hiçbir şeyi değiştirmeyen commit (satır sonu, girinti) hiçbir satıra sahip olmaz, bu yüzden tablolarda görünmez. Her görünüm bunlardan en fazla beşini `whitespace-only commits` satırında yazar: yazar, dosya ve dosyanın şimdiki sahibi. Hiçbir sayıyı değiştirmez.

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

Tablonun altında, bir öneri olduğunda tek bir `identity hint:` satırı çıkar. Kişiyi ve adreslerini adlandırır ve `--identities` komutunu gösterir. Son cümlesi, adresler tek kişi olsaydı o kişinin sahip olacağı satır sayısını ve yüzdesini verir; böylece hem tablodaki rakam hem birleşik rakam bildirilebilir. Çalıştırma başına bir kez yazılır; `--group-by` ile de böyledir.

`--merge-identities` önerilen aynı kişi adreslerini yalnızca o çalıştırmada tek kişi sayar. Birleşik satır ilk sıraya gelir ve tablo her birleştirmeyi onun altında adlandırır. Bus factor ile biçimlendirme karşılaştırması da birleşik satırları kullanır. Hiçbir şey yazılmaz. Test deposunda, varsayılan biçimlendirme düzeltmesiyle:

```
ref HEAD  ·  files 18/18 sampled (1 in 1)  ·  1,985 of 1,995 lines attributed
git blame -w -M --ignore-rev 62628c0 (auto)  ·  commits 315, merges excluded
bots excluded: 1 identity, 10 lines, 11 commits (--include-bots counts them)

author                          lines   share  commits   share
--------------------------------------------------------------
Troy Goode (2 addresses)          810   40.8%       95   30.2%
Douglas Christopher Wilson        629   31.7%      143   45.4%
Íñigo Marquínez Prado              95    4.8%        2    0.6%
Jon Church                         72    3.6%        3    1.0%
Sebastian Beltran                  67    3.4%        2    0.6%
Ulises Gascón                      52    2.6%        3    1.0%
Ignacio Mangas                     44    2.2%        2    0.6%
alex94puchades                     34    1.7%        5    1.6%
Linus Unnebäck                     26    1.3%        1    0.3%
Ollie Buck                         17    0.9%        1    0.3%
… 52 more authors
identities merged in memory (nothing written): Troy Goode = troy@work.example 762 lines 93 commits, troy@laptop.example 48 lines 2 commits; this is a guess from names and addresses; leave out --merge-identities for the unmerged table.

bus factor 2: Troy Goode (2 addresses) and Douglas Christopher Wilson together hold 72.5% of 1,985 surviving lines
bus factor = the smallest number of authors whose surviving lines together reach 50% of the lines counted (change with --bus-factor-threshold). It measures how concentrated the code that is left is, not who understands it.
```

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

`git shortlog -sn` yalnızca commit sayar. git-fame (Python aracı, bu yazılırken 4.2.1) de her dosyayı
blame'ler ve yazar başına hayatta kalan satırı, commit'i ve dosyayı yazar. En yakın araçtır, satır payını
commit payının yanında `distribution` sütununda gösterir ve birçok konuda bu araçtan fazlasını yapar: tek
çalıştırmada birden çok depo, blame tarafına da uygulanan `--since` ve `--until` penceresi, svg ve yaml çıktısı,
pip, conda, snap ve docker ile kurulum, maliyet tahmini.

[`docs/COMPARISON.md`](docs/COMPARISON.md) ikisini aynı örnek depolarda çalıştırır ve bu aracın kaybettiği
satırlar dahil her sonucu listeler. Hayatta kalan satır, commit, yok sayılan revizyonlar, ortak yazar payı ve
uzantı başına toplamlarda ikisi aynı sayıları verir. Yalnızca bu araç dosyaları tuzlu bir hash ile örnekler,
botları varsayılan olarak iki paydan da çıkarır, iki adresi olan bir kişi için `.mailmap` satırı önerir,
adresi olmayan bir `Assisted-by:` satırında durmaz ve AI asistanı satırlarını ayrı sayar, hiçbir ignore dosyasında adı geçmeyen biçimlendirme commit'lerini listeler. git-fame'in
listesinden bir şeye ihtiyacınız varsa onu kullanın; yeniden üretilebilir örnek, kimlik ve bot yönetimi
gerekiyorsa bunu.

[`docs/HEAD-TO-HEAD.md`](docs/HEAD-TO-HEAD.md) ikinci bir karşılaştırmayı anlatır: bu araç, Claude Code eklentileri project-pilot (komutuyla ve komutsuz), mcp-git-historian ve k41n/busfactor ile düz Claude, aynı örnek depolar hakkındaki aynı sahiplik sorularını yanıtlıyor.

Round 13 sonucu, 24 Ekim 2026'da Claude Sonnet 5.5 (Claude Code 2.1.308) ile, kol ve görev başına üç koşu, her hücre yeni, ölçüt başına beş bağımsız model oyuyla notlandı:

- **z seti, 5 görev (25 ölçüt)**, bu kodu hiç görmemiş bir yazar tarafından yazıldı: bu araç 9,67; en iyi diğer kol (komutuyla project-pilot) 7,33; farkın %95 aralığı +0,33 ile +4,33.
- **Herkese açık set, 11 görev (55 ölçüt)**, geliştirmede kullanıldı: bu araç 47,67; en iyi diğer kol (düz Claude) 41,00; farkın %95 aralığı +5,00 ile +8,33.

Görev bazında kural (her görevde diğer her koldan önde olmak) z setinde sağlanmadı. Her hücre, plandan sapmalar ve yeniden hesaplama adımı (`python3 -I score.py --check`) [`bench/head-to-head/results/round13-claude-sonnet-5-5/`](bench/head-to-head/results/round13-claude-sonnet-5-5/) içindedir. Sonuç bu görevleri, bu modeli ve bu tarihi kapsar; başka görevler hakkında iddia değildir.

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

Bu araç işinize yaradıysa, GitHub'da bir yıldız başkalarının onu bulmasına yardımcı olur.

MIT.
