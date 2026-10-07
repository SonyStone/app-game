/**
 * GodSVG's credits from its `app_info.toml` (commit 3ba20e71), shown in the About dialog. Translators come from the
 * translations' `translation-credits` entries instead.
 */
export const godSvgCredits = {
  projectFounderAndManager: 'MewPurPur',
  authors: [
    'Aaron Franke (aaronfranke)',
    'ajreckof',
    'cadennabors',
    'DevPoodle',
    'FlooferLand',
    'ilikefrogs101',
    'Yordan Dolchinkov (Jordyfel)',
    'Kiisu-Master',
    'MewPurPur',
    'Qainguin',
    'Serem Titus (SeremTitus)',
    'fishnpotatoes (sockeye-d)',
    'Swarkin',
    'Anish Mishra (syntaxerror247)',
    'thiagola92',
    'Tom Blackwell (Volts-s)',
    'WeaverSong'
  ],
  donors: { names: ['HangLang'], anonymous: 1 },
  goldenDonors: { names: [] as string[], anonymous: 0 },
  diamondDonors: { names: ['Aaron Franke (aaronfranke)'], anonymous: 0 }
} as const;

/** GodSVG's license (MIT), as its About dialog shows it. */
export const godSvgLicense = `MIT License

Copyright (c) 2023 MewPurPur
Copyright (c) 2023-present GodSVG contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/** Third-party parts of this port, like GodSVG's "Third-party licenses" tab. */
export const thirdPartyComponents = [
  { name: 'GodSVG (design, icons, translations)', copyright: '2023-present MewPurPur and GodSVG contributors', license: 'MIT' },
  { name: 'Noto Sans font', copyright: '2012, Google Inc.', license: 'OFL-1.1' },
  { name: 'Droid Sans Fallback font', copyright: '2008, The Android Open Source Project', license: 'Apache-2.0' },
  { name: 'JetBrains Mono font', copyright: '2020, The JetBrains Mono Project Authors', license: 'OFL-1.1' },
  { name: 'SolidJS', copyright: '2016-present Ryan Carniato', license: 'MIT' }
] as const;
