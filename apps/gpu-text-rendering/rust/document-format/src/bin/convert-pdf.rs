//! Local corpus utility. Keeps source PDFs outside the repository and writes GDOC only on success.

use std::{env, fs, process::ExitCode, time::Instant};

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = env::args_os().skip(1).collect();
    if args.len() != 2 {
        return Err("Usage: convert-pdf input.pdf output.gdoc".into());
    }

    let start = Instant::now();
    let bytes = gpu_document::pdf::convert_owned(fs::read(&args[0])?)?;
    let document = gpu_document::curves::decode(&bytes)?;
    fs::write(&args[1], &bytes)?;
    println!(
        "{} pages, {} curves, {} draws, {} images, {} pixel bytes, {} file bytes, {:?}",
        document.pages.len(),
        document.curves.len() / 32,
        document.instances.len() / 80,
        document.images.table.len() / 24,
        document.images.pixels.len(),
        bytes.len(),
        start.elapsed()
    );
    Ok(())
}
