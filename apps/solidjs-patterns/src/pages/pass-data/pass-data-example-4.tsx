const ValueContext = createContext(defaultValue);

function ValueProvider(props) {
  return <ValueContext.Provider value={newValue}>{props.children}</ValueContext.Provider>;
}

function Consumer() {
  const value = useContext(ValueContext);

  return <span>{value}</span>;
}