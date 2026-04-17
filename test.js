const fs = require('fs');
fetch("https://avrbgpmzabktqwyzqibq.supabase.co/functions/v1/parse-expense", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "taxi 500" })
})
.then(res => res.json())
.then(data => {
  fs.writeFileSync('err_output.log', data.error);
  console.log('done');
})
.catch(console.error);
