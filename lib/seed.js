// Стартовые данные: меню, модификаторы, настройки заведения.
// Структура полностью управляется из админ-панели, это только «первый запуск».

module.exports = function seed() {
  const categories = [
    { id: 'popular', name: 'Популярное', icon: '★' },
    { id: 'burgers', name: 'Бургеры', icon: '🍔' },
    { id: 'pizza', name: 'Пицца', icon: '🍕' },
    { id: 'snacks', name: 'Закуски', icon: '🍟' },
    { id: 'salads', name: 'Салаты', icon: '🥗' },
    { id: 'drinks', name: 'Напитки', icon: '🥤' },
    { id: 'desserts', name: 'Десерты', icon: '🍰' }
  ];

  const modGroups = [
    {
      id: 'burger-add', name: 'Добавить в бургер', type: 'multi', required: false,
      options: [
        { id: 'bacon', name: 'Бекон', price: 79 },
        { id: 'jalapeno', name: 'Халапеньо', price: 49 },
        { id: 'cheese', name: 'Двойной сыр', price: 59 },
        { id: 'sauce', name: 'Фирменный соус', price: 39 }
      ]
    },
    {
      id: 'pizza-size', name: 'Размер пиццы', type: 'single', required: true,
      options: [
        { id: 'p25', name: '25 см', price: 0 },
        { id: 'p30', name: '30 см', price: 200 },
        { id: 'p35', name: '35 см', price: 400 }
      ]
    },
    {
      id: 'salad-add', name: 'Добавить к салату', type: 'multi', required: false,
      options: [
        { id: 'chicken', name: 'Курица гриль', price: 99 },
        { id: 'shrimp', name: 'Креветки', price: 189 },
        { id: 'parmesan', name: 'Пармезан', price: 59 }
      ]
    },
    {
      id: 'coffee-size', name: 'Объём', type: 'single', required: true,
      options: [
        { id: 'c300', name: '300 мл', price: 0 },
        { id: 'c400', name: '400 мл', price: 50 }
      ]
    },
    {
      id: 'coffee-milk', name: 'Молоко', type: 'single', required: true,
      options: [
        { id: 'milk', name: 'Обычное', price: 0 },
        { id: 'alt', name: 'Растительное', price: 60 }
      ]
    },
    {
      id: 'syrup', name: 'Сироп', type: 'multi', required: false,
      options: [
        { id: 'caramel', name: 'Карамель', price: 40 },
        { id: 'vanilla', name: 'Ваниль', price: 40 },
        { id: 'nut', name: 'Орех', price: 40 }
      ]
    },
    {
      id: 'drink-size', name: 'Объём', type: 'single', required: true,
      options: [
        { id: 'd400', name: '0,4 л', price: 0 },
        { id: 'd500', name: '0,5 л', price: 40 }
      ]
    }
  ];

  let n = 0;
  const p = (o) => Object.assign({
    id: 'p' + (++n),
    image: '', badge: '', desc: '', kcal: 0, protein: 0, fat: 0, carbs: 0,
    mods: [], available: true, popular: false, categoryId: 'burgers'
  }, o);

  const products = [
    p({
      id: 'cheeseburger', categoryId: 'burgers', name: 'Чизбургер классический', price: 289, popular: true,
      desc: 'Говяжья котлета, чеддер, лук, солёный огурец и горчично-томатный соус',
      image: '/assets/burger.jpg', kcal: 512, protein: 26, fat: 28, carbs: 38, mods: ['burger-add']
    }),
    p({
      id: 'doublecheese', categoryId: 'burgers', name: 'Двойной чизбургер', price: 399, popular: true, badge: 'Хит',
      desc: 'Две котлеты, двойной чеддер, свежие овощи и фирменный соус',
      image: '/assets/burger.jpg', kcal: 612, protein: 34, fat: 31, carbs: 48, mods: ['burger-add']
    }),
    p({
      id: 'chickenburger', categoryId: 'burgers', name: 'Куриный бургер', price: 319,
      desc: 'Куриное филе в хрустящей панировке, салат айсберг, соус цезарь',
      image: '/assets/chicken.jpg', kcal: 468, protein: 29, fat: 19, carbs: 44, mods: ['burger-add']
    }),
    p({
      id: 'pepperoni', categoryId: 'pizza', name: 'Пицца пепперони', price: 549, popular: true, badge: 'Новинка',
      desc: 'Томатный соус, моцарелла, пепперони, щепотка орегано',
      image: '/assets/pizza.jpg', kcal: 1180, protein: 52, fat: 48, carbs: 132, mods: ['pizza-size']
    }),
    p({
      id: 'margherita', categoryId: 'pizza', name: 'Пицца маргарита', price: 449,
      desc: 'Томаты, моцарелла фиор-ди-латте, базилик, оливковое масло',
      image: '/assets/margherita.jpg', kcal: 980, protein: 42, fat: 36, carbs: 118, mods: ['pizza-size']
    }),
    p({
      id: 'fries', categoryId: 'snacks', name: 'Картофель фри', price: 149, popular: true,
      desc: 'Хрустящая соломка с морской солью',
      image: '/assets/fries.jpg', kcal: 312, protein: 4, fat: 15, carbs: 41, mods: ['burger-add']
    }),
    p({
      id: 'nuggets', categoryId: 'snacks', name: 'Наггетсы, 9 шт.', price: 259,
      desc: 'Куриная грудка в панировке, соус на выбор',
      image: '/assets/nuggets.jpg', kcal: 398, protein: 24, fat: 22, carbs: 26, mods: ['burger-add']
    }),
    p({
      id: 'caesar', categoryId: 'salads', name: 'Салат цезарь', price: 329,
      desc: 'Романо, курица гриль, сухарики, пармезан, соус цезарь',
      image: '/assets/salad.jpg', kcal: 286, protein: 21, fat: 16, carbs: 14, mods: ['salad-add']
    }),
    p({
      id: 'cappuccino', categoryId: 'drinks', name: 'Капучино', price: 189, popular: true,
      desc: 'Эспрессо и взбитое молоко, зерно обжарки «средняя»',
      image: '/assets/coffee.jpg', kcal: 112, protein: 6, fat: 5, carbs: 9,
      mods: ['coffee-size', 'coffee-milk', 'syrup']
    }),
    p({
      id: 'lemonade', categoryId: 'drinks', name: 'Лимонад домашний', price: 159,
      desc: 'Лимон, мята, сироп и лёд — готовим каждый день',
      image: '/assets/drink.jpg', kcal: 98, protein: 0, fat: 0, carbs: 24, mods: ['drink-size']
    }),
    p({
      id: 'mors', categoryId: 'drinks', name: 'Морс клюквенный', price: 139,
      desc: 'Клюква, сахар, вода. Ягодный и кисло-сладкий',
      image: '/assets/drink.jpg', kcal: 76, protein: 0, fat: 0, carbs: 19, mods: ['drink-size']
    }),
    p({
      id: 'cheesecake', categoryId: 'desserts', name: 'Чизкейк ягодный', price: 219,
      desc: 'Нежный сливочный сыр на песочной основе, ягодный соус',
      image: '/assets/dessert.jpg', kcal: 342, protein: 7, fat: 22, carbs: 28
    }),
    p({
      id: 'medovik', categoryId: 'desserts', name: 'Медовик', price: 199, popular: true,
      desc: 'Восемь коржей, крем на сметане, немного мёда',
      image: '/assets/dessert.jpg', kcal: 388, protein: 6, fat: 24, carbs: 36
    })
  ];

  const combos = [
    {
      id: 'combo-day',
      name: 'Комбо дня',
      badge: 'Только сегодня',
      desc: 'Двойной чизбургер, картофель фри и лимонад',
      price: 399,
      image: '',
      enabled: true,
      items: [
        { productId: 'doublecheese', qty: 1 },
        { productId: 'fries', qty: 1 },
        { productId: 'lemonade', qty: 1 }
      ]
    }
  ];

  return {
    settings: {
      venue: 'ПОРЦИЯ',
      address: 'Frankfurter Allee 12, Berlin',
      currency: '₽',
      kioskTitle: 'ПОРЦИЯ',
      kioskSubtitle: 'Закажите и оплатите здесь — заказ сразу уйдёт на кухню',
      serviceMode: 'both', // card | counter | both
      avgCookingMinutes: 7
    },
    categories,
    modGroups,
    products,
    combos,
    orders: [],
    seq: 183,
    stats: { startedAt: new Date().toISOString() }
  };
};
