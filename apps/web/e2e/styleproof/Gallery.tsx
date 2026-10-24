import { Button, TextField } from '@repo/ui';

export function Gallery() {
  const component = new URLSearchParams(window.location.search).get('component');
  const sections = [
    <section key="component-button" id="component-button" data-component="component-button">
      <h2>Button</h2>
      <figure>
        <h3>Default</h3>
        <Button>Greet</Button>
      </figure>
      <figure>
        <h3>Submit</h3>
        <Button type="submit">Submit</Button>
      </figure>
      <figure>
        <h3>Disabled</h3>
        <Button disabled>Greet</Button>
      </figure>
      <figure>
        <h3>Long label</h3>
        <Button>Greet everyone in the component gallery</Button>
      </figure>
    </section>,
    <section
      key="component-text-field"
      id="component-text-field"
      data-component="component-text-field"
    >
      <h2>TextField</h2>
      <figure>
        <h3>Empty</h3>
        <TextField label="Name" />
      </figure>
      <figure>
        <h3>With value</h3>
        <TextField label="Name" defaultValue="Ada" />
      </figure>
      <figure>
        <h3>Placeholder</h3>
        <TextField label="Name" placeholder="Enter your name" />
      </figure>
      <figure>
        <h3>Disabled</h3>
        <TextField label="Name" disabled />
      </figure>
      <figure>
        <h3>With error</h3>
        <TextField label="Name" error="Enter a name" />
      </figure>
    </section>,
  ];
  return (
    <main className="app">
      <h1>Component gallery</h1>
      {sections.filter((section) => !component || section.props.id === component)}
    </main>
  );
}
