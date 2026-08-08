export const DEFAULT_ADMIN_ANALYTICS = Object.freeze({
  metrics: [
    { id: 'mrr', label: 'MRR', value: '847 500 ₽', delta: '+3.2%', direction: 'up', tone: 'violet' },
    { id: 'clients', label: 'Клиентов', value: '127', delta: '+3 за мес.', direction: 'up', tone: 'cyan' },
    { id: 'churn', label: 'Churn Rate', value: '3.1%', delta: '-0.1%', direction: 'down', tone: 'green' },
    { id: 'arpu', label: 'ARPU', value: '6 673 ₽', delta: '+1.8%', direction: 'up', tone: 'magenta' },
  ],
  months: ['АВГ','СЕН','ОКТ','НОЯ','ДЕК','ЯНВ','ФЕВ'],
  mrr: [612,655,688,724,768,812,847],
  newClients: [7,8,10,9,12,11,13],
  churnClients: [3,4,3,5,4,3,4],
  churnRate: [4.8,4.4,4.1,3.9,3.6,3.2,3.1],
  plans: {
    starter: [28,30,31,33,35,37,39],
    professional: [21,24,28,32,36,41,46],
    business: [8,10,11,14,17,20,23],
  },
  platforms: [
    { id:'yandex', name:'Яндекс.Карты', reviews:12480, replies:9850, coverage:79, rating:4.3, trend:+2.4 },
    { id:'2gis', name:'2GIS', reviews:8920, replies:7120, coverage:80, rating:4.1, trend:+1.8 },
    { id:'google', name:'Google Maps', reviews:6340, replies:5890, coverage:93, rating:4.6, trend:+3.1 },
    { id:'otzovik', name:'Отзовик', reviews:3120, replies:2340, coverage:75, rating:3.9, trend:-0.4 },
    { id:'tripadvisor', name:'Tripadvisor', reviews:1840, replies:1650, coverage:90, rating:4.5, trend:+0.9 },
  ],
  insights: [
    { id:'ins-1', tone:'green', title:'Лучший рост MRR за квартал', text:'Профессионал ускоряется быстрее остальных тарифов: +27% за 3 месяца.' },
    { id:'ins-2', tone:'violet', title:'Google Maps — лучшая обработка', text:'93% отзывов получают ответ, средний рейтинг 4.6.' },
    { id:'ins-3', tone:'orange', title:'Отзовик требует внимания', text:'Охват ответами ниже 80%, рейтинг площадки 3.9.' },
  ],
});

export const ANALYTICS_PERIOD_MULTIPLIER = Object.freeze({ month: 1, quarter: 1.04, year: 1.11 });
