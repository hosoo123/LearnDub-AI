type GlossaryEntry = {
  source: string;
  target: string;
  context: string;
};

const glossary: GlossaryEntry[] = [
  {
    source: "from outer space",
    target: "сансар огторгуйгаас",
    context: "сансраас ирсэн гэсэн утгатай үед",
  },
  {
    source: "outer space",
    target: "сансар огторгуй",
    context: "огторгуй, сансрын орон зайг хэлэх үед",
  },
  {
    source: "astronaut",
    target: "сансрын нисгэгч",
    context: "сансарт ажилладаг хүнийг хэлэх үед",
  },
  {
    source: "get my life together",
    target: "амьдралаа цэгцлэх",
    context: "амьдралаа эмхэлж, асуудлаа зохицуулж эхлэх гэсэн хэлц",
  },
  {
    source: "get your life together",
    target: "амьдралаа цэгцлэх",
    context: "амьдралаа эмхэлж, асуудлаа зохицуулж эхлэх гэсэн хэлц",
  },
  {
    source: "starting to get my life together",
    target: "амьдралаа цэгцэлж эхлэх",
    context: "амьдралаа эмхэлж эхэлж байтал гэсэн утгатай ярианы хэллэг",
  },
  {
    source: "starting to get your life together",
    target: "амьдралаа цэгцэлж эхлэх",
    context: "амьдралаа эмхэлж эхэлж байтал гэсэн утгатай ярианы хэллэг",
  },
  {
    source: "I was just starting to get my life together",
    target: "Би амьдралаа цэгцэлж эхэлж байтал",
    context: "амьдралаа эмхэлж эхэлж байтал гэсэн утгатай ярианы хэллэг",
  },
  {
    source: "feel sorry for yourself",
    target: "өөрийгөө өрөвдөх",
    context: "өөрт тохиолдсон зүйлд гутарч, өөрийгөө өрөвдөх гэсэн хэлц",
  },
  {
    source: "feeling sorry for yourself",
    target: "өөрийгөө өрөвдөх",
    context: "өөрт тохиолдсон зүйлд гутарч, өөрийгөө өрөвдөх гэсэн хэлц",
  },
  {
    source: "Now I find you sitting here feeling sorry for yourself",
    target: "Одоо харсан чинь чи энд өөрийгөө өрөвдөөд сууж байх юм",
    context: "хэн нэгнийг өөрийгөө өрөвдөн сууж байгааг олж харах ярианы хэллэг",
  },
  {
    source: "make my life a living hell",
    target: "амьдралыг минь там болгох",
    context: "амьдралыг маш хэцүү, зовлонтой болгох гэсэн хэлц",
  },
  {
    source: "make your life a living hell",
    target: "амьдралыг чинь там болгох",
    context: "амьдралыг маш хэцүү, зовлонтой болгох гэсэн хэлц",
  },
  {
    source: "I wish I had known",
    target: "мэдсэн ч болоосой",
    context: "өнгөрсөнд болоогүй зүйлдээ харамсах үед",
  },
  {
    source: "move out",
    target: "нүүж гарах",
    context: "амьдарч буй байр, гэрээсээ нүүх тухай үед",
  },
  {
    source: "moved out",
    target: "нүүж гарсан",
    context: "амьдарч буй байр, гэрээсээ нүүсэн тухай өнгөрсөн цагт",
  },
  {
    source: "take my keys",
    target: "түлхүүрээ авч явах",
    context: "өөрийн түлхүүрийг авч явах тухай үед",
  },
  {
    source: "taken my keys",
    target: "түлхүүрээ авч явсан",
    context: "өөрийн түлхүүрийг авч явсан тухай өнгөрсөн цагт",
  },
  {
    source: "should have moved out and taken my keys with me",
    target: "нүүж гараад түлхүүрээ авч явсан бол дээр байж",
    context: "өнгөрсөнд хийх ёстой байсан үйлдэлдээ харамсах үед",
  },
  {
    source: "I wish I had known you would come back and make my life a living hell",
    target: "Чамайг буцаж ирээд амьдралыг минь там болгоно гэдгийг мэдсэн ч болоосой",
    context: "хэн нэгэн буцаж ирж асуудал үүсгэхийг мэдээгүйдээ харамсах ярианы хэллэг",
  },
  {
    source: "take the keys",
    target: "түлхүүрийг авч явах",
    context: "ярианы нөхцөлөөс хамааран түлхүүрийг авч явах тухай үед",
  },
  {
    source: "get along",
    target: "эвтэй байх / аргацааж амьдрах",
    context: "хүмүүсийн харилцаанд эвтэй байх; амьдралаа авч явах тухайд аргацааж амьдрах гэсэн утгаар",
  },
  {
    source: "learned how to get along",
    target: "чамгүйгээр амьдарч сурсан",
    context: "ойр орчмын ярианд салсан хүнгүйгээр амьдралаа авч явах тухай үед",
  },
  {
    source: "so you're back",
    target: "тэгтэл чи буцаад ирлээ",
    context: "хэн нэгэн гэнэт эргэж ирэхэд ярианы өнгөөр",
  },
  {
    source: "and so you're back",
    target: "тэгтэл чи буцаад ирлээ",
    context: "өмнөх өгүүлбэрийн үргэлжлэлд хүн гэнэт эргэж ирэх тухай",
  },
  {
    source: "sad look upon your face",
    target: "гунигтай царайтай",
    context: "царайны гунигтай төрхийг дүрслэхэд",
  },
  {
    source: "walked in to find you here",
    target: "орж иртэл чамайг энд байгааг харлаа",
    context: "орж ирээд хэн нэгнийг тухайн газраас олж харах үед",
  },
  {
    source: "just walked in",
    target: "дөнгөж орж иртэл",
    context: "хэн нэгэн саяхан орж ирснийг илэрхийлэх ярианы хэллэг",
  },
  {
    source: "find you here with that sad look",
    target: "чи энд гунигтай царайтай сууж байх юм",
    context: "хэн нэгнийг гунигтай царайтай сууж байгааг олж харах үед",
  },
  {
    source: "with that sad look",
    target: "гунигтай царайтай",
    context: "хүний царайны төрхийг өмнөх өгүүлбэртэй холбон дүрслэхэд",
  },
  {
    source: "stupid lock",
    target: "тэр тэнэг цоож",
    context: "хаалганы цоожид уурлаж хэлж байгаа ярианд",
  },
  {
    source: "changed that stupid lock",
    target: "тэр тэнэг цоожийг сольсон",
    context: "цоожийг солих ёстой байсан гэсэн харамссан утгаар",
  },
  {
    source: "should have changed that stupid lock",
    target: "тэр тэнэг цоожийг солих ёстой байж",
    context: "цоожийг солих ёстой байсан гэсэн харамссан утгаар",
  },
  {
    source: "make you leave your key",
    target: "чамайг түлхүүрээ үлдээхийг шаардах",
    context: "хэн нэгнээр түлхүүрээ үлдээх үйлдэл хийлгэх тухай үед",
  },
  {
    source: "made you leave your key",
    target: "чамайг түлхүүрээ үлдээгээд явахыг шаардах",
    context: "хэн нэгнээр түлхүүрээ үлдээх ёстой байсан гэсэн харамссан утгаар",
  },
  {
    source: "should have made you leave your key",
    target: "чамайг түлхүүрээ үлдээгээд явахыг шаардах ёстой байж",
    context: "хэн нэгнээр түлхүүрээ үлдээх ёстой байсан гэсэн харамссан утгаар",
  },
  {
    source: "if I'd known",
    target: "хэрэв би мэдсэн бол",
    context: "хараахан болоогүй, эсвэл мэдээгүй өнгөрсөн үйл явдалд харамсах үед",
  },
  {
    source: "if I'd known for just one second",
    target: "ганцхан хором ч болов мэдсэн бол",
    context: "өнгөрсөнд мэдээгүйдээ харамсах, дараагийн мөртэй холбогдох үед",
  },
  {
    source: "back to bother me",
    target: "дахиад ирж намайг зовоох",
    context: "хэн нэгэн эргэж ирээд төвөг удах тухай ярианд",
  },
  {
    source: "go on now",
    target: "за одоо яв",
    context: "хүнийг явуулах ярианы тушаалд",
  },
  {
    source: "walk out the door",
    target: "хаалгаар гараад яв",
    context: "хүнийг хаалгаар гарч явахыг шаардах үед",
  },
  {
    source: "bring your head in this window",
    target: "толгойгоо энэ цонхоор тат",
    context: "цонхоор гарсан толгойг дотогш татахыг анхааруулсан үед",
  },
  {
    source: "roll it up in there",
    target: "дотор нь хавчих",
    context: "цонхыг өргөж хаахдаа дотор нь хавчих гэсэн сүрдүүлсэн үгэнд",
  },
  {
    source: "before I roll it up in there",
    target: "цонхыг чинь өргөж хаахаас өмнө",
    context: "цонхыг өргөж хаахдаа дотор нь хавчих тухай заналхийлсэн үгэнд",
  },
  {
    source: "[music playing]",
    target: "[Хөгжим эгшиглэж байна]",
    context: "хадмалын дуу, хөгжмийн тайлбар",
  },
  {
    source: "[humming the tune]",
    target: "[Ая аялж байна]",
    context: "ая аялж буйг тэмдэглэсэн хадмалын тайлбар",
  },
  {
    source: "lock",
    target: "цоож",
    context: "хаалганы түгжээний тухай үед",
  },
  {
    source: "key",
    target: "түлхүүр",
    context: "хаалганы цоож онгойлгох хэрэгслийн тухай үед",
  },
  {
    source: "on the table",
    target: "ширээн дээр",
    context: "юм ширээн дээр байрлаж байгааг хэлэх үед",
  },
];

function findPhrase(text: string, phrase: string): number | undefined {
  const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[^A-Za-z0-9])(${escapedPhrase})(?=$|[^A-Za-z0-9])`, "i").exec(text);
  return match?.index === undefined ? undefined : match.index + match[0].length - match[1].length;
}

export function formatRelevantGlossary(texts: readonly string[]): string {
  const combinedText = texts.join("\n");
  const matches = glossary.flatMap((entry) => {
    const index = findPhrase(combinedText, entry.source);
    return index === undefined ? [] : [{ entry, index, end: index + entry.source.length }];
  }).sort((a, b) => b.entry.source.length - a.entry.source.length);

  const selected: typeof matches = [];
  for (const match of matches) {
    if (selected.some((entry) => match.index < entry.end && entry.index < match.end)) continue;
    selected.push(match);
  }

  return selected
    .sort((a, b) => a.index - b.index)
    .map(({ entry }) => `- ${entry.source} = ${entry.target}`)
    .join("\n");
}
