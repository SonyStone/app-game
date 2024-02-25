import { batch, createSignal } from "solid-js";
import styles from './BatchingUpdates.module.css';

export default function BatchingUpdates() {
  const [firstName, setFirstName] = createSignal("John");
  const [lastName, setLastName] = createSignal("Smith");

  const fullName = () => {
    console.log("Running FullName");
    return `${firstName()} ${lastName()}`
  }

  const what = () => {

    console.log("Running Wut? Why?");

    return 'wut?';
  }

  const updateNames = () => {
    console.log("Button Clicked");
    batch(() => {
      setFirstName(firstName() + "n");
      setLastName(lastName() + "!");
    })
  }
  
  return <button class={styles.button} onClick={updateNames}>My name is {fullName()} {what()}</button>
};