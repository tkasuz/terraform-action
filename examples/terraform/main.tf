terraform {
  required_version = ">= 1.0"

  # Example backend - configure for your needs
  # backend "s3" {
  #   bucket = "my-terraform-state"
  #   key    = "example/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

# Example provider
provider "random" {}

# Example resource
resource "random_pet" "example" {
  length    = 2
  separator = "-"
}

# Example output
output "pet_name" {
  value       = random_pet.example.id
  description = "The generated pet name"
}
