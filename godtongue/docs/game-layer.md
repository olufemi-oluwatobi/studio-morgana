# Games (Thebes)

A game is a godtongue piece that plays. The piece is drawn and lit as always: that is the **skin**. One `Play …`
sentence puts a game on drawn things in it, a few more sentences say how the game's parts look and what the panel's
controls do, and the `game` engine builds one page that runs in an iframe and talks to the page around it.

First game: **wordle**. Skins: the analog player (`examples/games/diner-deck.gt`, lit) and the flat full-colour player
(`examples/games/pop-player.gt`: the panel is the whole page, the sponsor's name runs round all four edges).

```
node bin/gt.js build examples/games/diner-deck.gt --engine game
node bin/gt.js batch examples/games/deck/template.gt examples/games/deck/challenges.csv --engine game
```

## The words

| Sentence | What it does |
| --- | --- |
| `Play wordle on the screen, with the keyboard on the deck.` | which game, and the drawn things it fills (draw them first) |
| `Let the word be "toast".` · `Let the tries be 6.` | the game's values: plain Let values, so `$word` from a batch sheet works |
| `Every tile is #15130f, with ink letters, in Martian Mono, glowing, sunk, corners 6.` | how every tile looks |
| `A correct tile is #1f6b4f, with #b8ffd9 letters.` | how a tile looks in a state, over the above |
| `Every key is ivory, with #2b2118 letters, raised.` · `An absent key is #5a554d.` | the keyboard, the same way |
| `Control the light with the dial.` | the panel's own control: turning the dial moves the light across the whole skin |
| `Control the power with the switch.` | the screen goes dark and back |
| `Let the time be 180 s.` | a time limit; the game is lost when it runs out (without one, a shown timer counts up) |
| `Let the series be "mamas-daily".` | which run of challenges the stats (played, wins, streak, best) add up across |
| `Show the timer on the time-box.` | a readout on a drawn thing: timer, best, streak, played, wins, tries (left) |
| `Every readout is ink, in Big Shoulders Display.` · `An urgent readout is #ff3b30.` | readout letters; urgent is the last 10 seconds |
| `When the game is won, say "Lunch is on us".` | words shown on the board and sent to the page; moments: started, guessed, won, lost, and `When the time runs out` |

Looks take a colour (`#hex`, a colour name or a Let name), a material (`gold`, `chrome`, `brass`, `ivory` …), `with <colour>
letters`, `in <font>`, `corners N`, `outlined in <colour>, N wide`, `glowing`, `raised`, `sunk` or `flat`. States: a tile is empty, typed, correct, present or
absent; a key is correct, present or absent.

## Trivia

```
Play trivia on the stage.
Let the questions be "What do we bake every morning? | Sourdough | Rye | Brioche | Bagel; …".   (right answer first; shuffled)
Let the questions be kept by the server.                                                       (contests)
Every question is ink, with white letters, in Libre Baskerville.
Every answer is white, with ink letters, in Inter, raised.  A chosen answer is lavender.
A correct answer is #14a86a.  A wrong answer is #e5484d.
Show the timer on the time-box.  Show the score on the score-box.     (readouts: timer, score, progress, best, streak, played, wins)
```

No keyboard: the four answers are buttons on the board. `won`/`lost` post `tries` = how many were right, `of` = the number of
questions. In server mode the page calls `start` (questions with shuffled options), `guess` (`{ n, pick }` → `{ right, status }`)
and `timeout`. Example: `examples/games/trivia/thebes-classic.gt`.

## A challenge is a .gt file

A template is a finished skin whose changing parts are `$variables` (`examples/games/deck/template.gt`). Each challenge is a
row of values (`challenges.csv`) or the same file with its Let lines changed. An agent can write a whole new skin from the
reference: the game words are listed by `gt reference` like every other verb.

## What gets built

`engines/game.js` writes one `index.html`:

- the skin: the web engine's scene and runtime (`web/engine.js`), unchanged, on a canvas;
- the game: `web/games/wordle.js`, DOM laid over the canvas in the same grid px, so the board sits exactly on the screen and
  the keys on the deck; looks become CSS;
- the word list: `web/games/words5.txt` (5-letter words from `word-list`, MIT, Sindre Sorhus).

The game's state is kept in the browser per challenge, so a reload carries on.

## Talking to the page

The game posts to its parent `{ source: 'gt-game', game, id, type, … }`:

| type | when | with |
| --- | --- | --- |
| `started` | a fresh game begins | |
| `ready` | the skin is drawn and the game is playable | `rows`, `letters`, `played`, `over` |
| `guessed` | after each guess | `row`, `of`, `result` |
| `won` / `lost` | the end | `tries`, `of`, `grid` (the share squares), `ms`, `reason` (`timeout`) |
| `said` | a `say` sentence fired | `event`, `text` |
| `control` | the light or power changed | `control`, `value` |

The page can send `{ type: 'set', light: [x, y] }`, `{ type: 'set', power: false }` and `{ type: 'reset' }`.
`examples/games/host.html` is a page that does all of this.

## Not yet

- The word is in the page. For contests, the server should keep it and score guesses.
- Tile and key looks are CSS from the skin's colours and materials, not drawn by the web engine's materials.
- More games, and the two other UI families.
