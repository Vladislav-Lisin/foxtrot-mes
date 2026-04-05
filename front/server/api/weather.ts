export default defineEventHandler(async () => {
  const data = await $fetch(
    `https://api.openweathermap.org/data/2.5/weather?q=Moscow&appid=396f3ede1c61f99e1daaf4fba335d6bd&units=metric&lang=ru`,
  );

  return data;
});
