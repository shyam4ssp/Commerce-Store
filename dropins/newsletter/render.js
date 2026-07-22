export function render(component, target) {
    target.appendChild(component());
}