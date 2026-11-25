// 뉴스브리핑 설정: 분류, 검색어, 보도자료 소스, 해외 지역
// 검색어·소스를 바꾸려면 이 파일만 고치면 됩니다.

export const PERIODS = {
  short: { label: '단기', desc: '최근 1주', days: 7 },
  mid: { label: '중기', desc: '최근 6개월', months: 6 },
  long: { label: '장기', desc: '최근 3년', months: 36 },
};

export const CATEGORIES = {
  labor: {
    label: '노동',
    focus: '노동자·노동조합·고용 관점에서 쟁점과 이해관계자를 분명히 드러낸다.',
    google: [
      '노동 OR 노조 OR 파업 OR 노사 OR 단체교섭',
      '고용 OR 일자리 OR 임금 OR 최저임금 OR 근로시간',
      '산재 OR 중대재해 OR 비정규직 OR 하청 OR 이주노동자',
    ],
    naver: ['노동', '노조 파업', '고용 일자리', '산업재해', '최저임금'],
  },
  politics: {
    label: '정치',
    focus: '권력 구도, 입법·정책 결정 과정과 여야 입장을 균형 있게 드러낸다.',
    google: [
      '국회 OR 대통령실 OR 여당 OR 야당 OR 정당',
      '선거 OR 개헌 OR 국정감사 OR 탄핵 OR 특검',
      '외교 OR 안보 OR 남북 OR 북한',
    ],
    naver: ['국회', '대통령실', '여야', '외교 안보', '남북'],
  },
  society: {
    label: '사회',
    focus: '시민 생활에 미치는 영향과 제도적 쟁점을 짚는다.',
    google: [
      '사건 OR 사고 OR 재난 OR 화재 OR 경찰',
      '교육 OR 의료 OR 복지 OR 저출생 OR 고령화',
      '환경 OR 기후 OR 인권 OR 법원 판결',
    ],
    naver: ['사회 사건', '교육', '의료', '복지', '기후 환경'],
  },
  economy: {
    label: '경제',
    focus: '거시지표·시장·정책의 흐름과 가계·기업에 미칠 영향을 짚는다.',
    google: [
      '경제 OR 금리 OR 물가 OR 환율 OR 한국은행',
      '부동산 OR 증시 OR 코스피 OR 가계부채',
      '수출 OR 반도체 OR 무역 OR 관세 OR 기업 실적',
    ],
    naver: ['경제', '금리 물가', '환율', '부동산', '수출'],
  },
};

// ── 한국 중앙기관 · 한국은행 보도자료 ─────────────────────────
// 정책브리핑(korea.kr) RSS는 2026-07-01 서비스가 중단되어 부처별 RSS를 씁니다.
// verified: 주소를 확인한 피드. false 는 주소 패턴으로 넣은 것이라 `npm run check-sources` 로 확인하세요.
export const PRESS_FEEDS = [
  { agency: '고용노동부', category: 'labor', url: 'https://www.moel.go.kr/rss/notice.do', verified: true },
  { agency: '고용노동부', category: 'labor', url: 'https://www.moel.go.kr/rss/policy.do', verified: true },
  { agency: '고용노동부', category: 'labor', url: 'https://www.moel.go.kr/rss/lawinfo.do', verified: true },
  { agency: '문화체육관광부', category: 'society', url: 'https://www.mcst.go.kr/common/rss/press.jsp', verified: true },
  { agency: '한국은행', category: 'economy', url: 'https://www.bok.or.kr/portal/bbs/B0000338/news.rss?menuNo=200690', verified: false },
  { agency: '한국은행', category: 'economy', url: 'https://www.bok.or.kr/portal/bbs/P0000093/news.rss?menuNo=200789', verified: true, note: '금통위 의결사항' },
  { agency: '한국은행', category: 'economy', url: 'https://www.bok.or.kr/portal/bbs/B0000245/news.rss?menuNo=200761', verified: true, note: '금통위 의사록' },
];

// 구글뉴스로 찾는 정부 보도자료 (부처 RSS가 없는 기관 보완)
export const PRESS_GOOGLE = {
  labor: '고용노동부 OR 중앙노동위원회 OR 최저임금위원회 보도자료',
  politics: '국무조정실 OR 외교부 OR 통일부 OR 국방부 OR 행정안전부 보도자료',
  society: '보건복지부 OR 교육부 OR 기후에너지환경부 OR 질병관리청 OR 경찰청 보도자료',
  economy: '재정경제부 OR 기획예산처 OR 산업통상부 OR 금융위원회 OR 국토교통부 OR 한국은행 보도자료',
};

// ── 해외: 지역 × 주제(경제·전쟁·정치) ─────────────────────────
// 번역 없이 쓰기 위해 한국 언론의 국제 기사(한국어)를 지역·주제별로 모읍니다.
// terms: 구글뉴스 검색어, naver: 네이버 검색어 앞부분(주제어와 합쳐 검색)
export const WORLD_THEMES = {
  economy: { label: '경제', terms: '경제 OR 금리 OR 물가 OR 관세 OR 증시 OR 무역 OR 성장률', naver: '경제' },
  war: { label: '전쟁·안보', terms: '전쟁 OR 공습 OR 휴전 OR 미사일 OR 군사 OR 교전 OR 병력', naver: '전쟁 군사' },
  politics: { label: '정치', terms: '대선 OR 총선 OR 정부 OR 의회 OR 총리 OR 대통령 OR 정권', naver: '정치' },
};

export const WORLD_REGIONS = {
  northAmerica: { label: '북미', terms: '미국 OR 백악관 OR 워싱턴 OR 캐나다', naver: '미국' },
  europe: { label: '유럽', terms: '유럽 OR EU OR 영국 OR 독일 OR 프랑스', naver: '유럽' },
  russiaUkraine: { label: '러시아·우크라이나', terms: '러시아 OR 우크라이나 OR 크렘린 OR 키이우', naver: '러시아 우크라이나' },
  middleEast: { label: '중동', terms: '중동 OR 이스라엘 OR 가자 OR 이란 OR 사우디 OR 레바논', naver: '중동' },
  eastAsia: { label: '동아시아', terms: '중국 OR 일본 OR 대만 OR 베이징 OR 도쿄', naver: '중국 일본' },
  southAsia: { label: '남·동남아시아', terms: '인도 OR 파키스탄 OR 인도네시아 OR 베트남 OR 필리핀 OR 아세안', naver: '동남아 인도' },
  latinAmerica: { label: '중남미', terms: '중남미 OR 브라질 OR 멕시코 OR 아르헨티나 OR 베네수엘라', naver: '중남미' },
  africa: { label: '아프리카', terms: '아프리카 OR 나이지리아 OR 수단 OR 에티오피아 OR 남아공', naver: '아프리카' },
};

export const LIMITS = {
  shortTopics: 10, // 단기 브리핑 이슈 수
  monthTopics: 8, // 월간 요약 이슈 수
  worldItemsPerTheme: 6,
  maxArticleAgeDays: 8,
};
