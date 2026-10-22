# d5 criteria: phpdotenv (PHP), ownership of live lines under src/Parser/ at the fixture HEAD (about 961 lines)
Hazards: maintainer under several e-mail addresses (same name), StyleCI style-only commits (synthetic bot one plus the real ones pushed through the maintainer account), pure rename of Regex.php into the directory, add/revert/reapply sequence, feature branch merged with a merge commit.

1. Graham Campbell is ONE person with about 83% of live lines (accept 80% to 86.5%) and is ranked first. FAIL if he is reported at or below 60%, or split into several entries (his several addresses are one person).
2. Fatima Zahra owns about 7.9% (accept 5.9% to 9.9%): her branch was merged by a merge commit, which does not take her lines. FAIL if she is missing, or below 4%.
3. Dmitri Volkov owns about 7.3% (accept 5.3% to 9.3%): his comment-stripping code was reverted and then re-landed by him. FAIL if he is missing or below 4%, or if his lines are credited to Graham Campbell.
4. Marta Kowalska (pure rename of Regex.php) and "StyleCI Bot" hold at most 0.5% each and the bot is not ranked as an owner; Regex.php lines are credited to the original authors. FAIL if Marta Kowalska is above 1%, or if StyleCI Bot appears as a ranked author.
5. The answer states what it left out or merged: at least two of (a) style-only commits (StyleCI) ignored, (b) rename followed or the moved file credited to its original authors, (c) Graham Campbell's several e-mail addresses merged. FAIL if fewer than two are stated, or if commit counts are used as the ownership measure.
