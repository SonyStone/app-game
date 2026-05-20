const [name, setName] = createSignal('');
const [email, setEmail] = createSignal('');
const [age, setAge] = createSignal(0);

function resetForm() {
  batch(() => {
    setName('');
    setEmail('');
    setAge(0);
  });
  // Subscribers notified once, with all fields reset
}